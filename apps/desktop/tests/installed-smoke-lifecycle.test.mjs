import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { assertNoConflicts, assertOwnedPath, createOwnedRun, ProcessScope, runInstaller } from '../../../scripts/installed-smoke-lifecycle.mjs';
import { dropDiskFile, waitFor, withCleanup } from '../../../scripts/smoke-runtime.mjs';

const p = (pid, parentPid, ms, name = 'CS2 Analyst.exe') => ({ pid, parentPid, created: new Date(ms).toISOString(), name });
const child = pid => Object.assign(new EventEmitter(), { pid, exitCode: null });
test('process cleanup excludes pre-existing/same-name processes and recycled PIDs, retains orphan descendants', async () => {
  let snapshot = [p(10, 1, 1000), p(20, 1, 2000), p(21, 20, 2100), p(22, 21, 2200)];
  const killed = [], scope = new ProcessScope({ snapshot: async () => snapshot, terminate: async process => { killed.push(process.pid); snapshot = snapshot.filter(p => p.pid !== process.pid); } });
  const root = child(20); scope.track(root, 'our app', 2000);
  assert.deepEqual((await scope.live()).map(p => p.pid), [20, 21, 22]);
  root.emit('exit');
  // PID 20 now belongs to someone else; its new child and the old user instance must survive.
  snapshot = [p(10, 1, 1000), p(20, 1, 3000), p(30, 20, 3100), p(21, 20, 2100), p(22, 21, 2200)];
  await scope.cleanup();
  assert.deepEqual(killed.sort(), [21, 22]);
  assert.deepEqual(snapshot.map(p => p.pid), [10, 20, 30]);
});
test('short-lived installer root can still identify its own detached helper', async () => {
  const root = child(100), scope = new ProcessScope();
  scope.track(root, 'installer', 2000); root.emit('exit');
  assert.deepEqual(scope.observe([p(101, 100, 2100), p(102, 1, 2100)]).map(p => p.pid), [101]);
});
test('a slow spawn return cannot shift ownership start time; callers must supply the pre-spawn timestamp', async () => {
  let processes = [p(20, 1, 2010)], terminated = false;
  const scope = new ProcessScope({ snapshot: async () => processes, terminate: async () => { terminated = true; processes = []; } });
  // Attachment occurs much later than creation. Only the timestamp captured before spawn is valid.
  assert.throws(() => scope.track(child(20), 'missing start'), /before spawn/);
  scope.track(child(20), 'slow launch', 2000);
  assert.equal((await scope.live()).length, 1);
  await scope.cleanup(); assert.equal(terminated, true);
});
test('preflight fails closed on a user instance or uninstall registration (including missing InstallLocation)', () => {
  assert.throws(() => assertNoConflicts([p(1, 0, 0)], []), /preserved without changes/);
  assert.throws(() => assertNoConflicts([], [{ uninstallString: '"E:\\old\\Uninstall CS2 Analyst.exe" /S', installLocation: null }]), /E:.*old/);
  assertNoConflicts([], []);
});
test('owned run refuses historical paths, traversal, forged markers and redirected directories', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'cs2-lifecycle-test-'));
  try {
    const run = createOwnedRun(workspace), target = join(run.directory, 'app');
    assertOwnedPath(run, target);
    assert.throws(() => assertOwnedPath(run, join(workspace, '.tmp/installed-smoke')), /inside owned run/);
    assert.throws(() => assertOwnedPath(run, join(run.directory, '../foreign')), /inside owned run/);
    if (process.platform === 'win32') {
      assertOwnedPath(run, target.toUpperCase());
      const otherDrive = run.directory[0].toUpperCase() === 'Z' ? 'Y' : 'Z';
      assert.throws(() => assertOwnedPath(run, otherDrive + ':\\foreign'), /inside owned run/);
    }
    assert.throws(() => assertOwnedPath({ ...run, token: 'forged' }, target));
    const outside = join(workspace, 'foreign'); mkdirSync(outside);
    symlinkSync(outside, target, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => assertOwnedPath(run, join(target, 'child')), /redirected path/);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});
test('all cleanups run and original failure survives; cleanup alone fails the run', async () => {
  const primary = new Error('real assertion failed'), calls = [];
  await assert.rejects(withCleanup(() => { throw primary; }, [() => { calls.push(1); throw new Error('cleanup'); }, () => calls.push(2)]), error => error === primary && error.cleanupErrors.length === 1);
  assert.deepEqual(calls, [1, 2]);
  await assert.rejects(withCleanup(() => 1, [() => { throw new Error('cleanup'); }]), AggregateError);
  for (const thrown of [undefined, null, false, 0, '']) {
    let rejected = false;
    try { await withCleanup(() => { throw thrown; }, []); }
    catch (error) { rejected = true; assert.equal(error, thrown); }
    assert.equal(rejected, true, 'even a falsy rejection must remain a failure');
  }
});
test('timeouts report the requested state, last observation and diagnostics; probe errors are not swallowed', async () => {
  await assert.rejects(waitFor(() => false, 5, 'fixture state', { intervalMs: 1, diagnostics: () => ({ phase: 'parsing' }) }), /fixture state.*last=false.*parsing/);
  await assert.rejects(waitFor(() => { throw new Error('assertion inside probe'); }, 100, 'fixture'), /assertion inside probe/);
});
test('real child installer timeout is failure, captures output and cleans only its own launch', async () => {
  const sentinel = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true });
  let scope;
  const events = [];
  scope = new ProcessScope({ snapshot: async () => scope.roots.filter(r => r.child.exitCode === null && r.child.signalCode === null && r.child.pid).map(r => p(r.pid, process.pid, r.startedAt, 'node.exe')), terminate: async process => { const r = scope.roots.find(r => r.pid === process.pid); r.child.kill(); } });
  try {
    await assert.rejects(runInstaller(scope, process.execPath, ['-e', 'console.log("installer-fixture");setInterval(()=>{},1000)'], { label: 'fixture install', directory: tmpdir(), timeoutMs: 250, audit: e => events.push(e) }), /installer exit.*超时/);
    assert.match(events[0].stdout, /installer-fixture/);
    assert.ok(events[0].elapsedMs >= 250);
    assert.equal(scope.roots[0].child.exitCode !== null || scope.roots[0].child.signalCode !== null, true);
    assert.equal(sentinel.exitCode, null, 'unrelated same-image process survives');
  } finally { sentinel.kill(); }
});
test('missing, failed launcher and nonzero installer exit are distinct errors with target diagnostics', async () => {
  const scope = new ProcessScope({ snapshot: async () => [] });
  await assert.rejects(runInstaller(scope, join(tmpdir(), 'missing-installer.exe'), [], { label: 'missing', directory: tmpdir() }), /Missing installer/);
  await assert.rejects(runInstaller(scope, process.execPath, ['-e', 'console.error("fixture-failure");process.exit(7)'], { label: 'failed', directory: tmpdir() }), /exit failed:.*"exitCode":7.*fixture-failure.*target/);
  const directory = mkdtempSync(join(tmpdir(), 'cs2-launcher-test-')), invalid = join(directory, 'invalid.exe');
  try {
    writeFileSync(invalid, 'not an executable');
    await assert.rejects(runInstaller(scope, invalid, [], { label: 'invalid', directory }), /launcher error/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Windows CIM identity cleanup removes real orphan child and preserves unrelated node process', { skip: process.platform !== 'win32' }, async () => {
  const sentinel = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true });
  const scope = new ProcessScope();
  const startedAt = Date.now();
  const launcher = spawn(process.execPath, ['-e', `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000);`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const record = scope.track(launcher, 'CIM fixture', startedAt);
  try {
    await waitFor(() => record.stdout.trim(), 5000, 'fixture child PID');
    const descendantPid = Number(record.stdout.trim());
    assert.ok((await scope.live()).some(p => p.pid === descendantPid));
    launcher.kill();
    await waitFor(() => launcher.signalCode !== null || launcher.exitCode !== null, 5000, 'fixture parent exit');
    await scope.cleanup();
    assert.equal((await scope.live()).length, 0);
    assert.equal(sentinel.exitCode, null);
  } finally {
    await scope.cleanup();
    sentinel.kill();
  }
});

test('drop failure survives a disconnected cleanup; a cleanup-only failure also fails', async () => {
  const primary = new Error('actual drop failed');
  const send = async method => method === 'DOM.getDocument' ? { root: { nodeId: 1 } } : { nodeId: 2 };
  const evaluate = async expression => {
    if (expression.includes('target.dispatchEvent')) throw primary;
    if (expression.includes('?.remove()')) throw new Error('cleanup disconnected');
  };
  await assert.rejects(dropDiskFile({ send, evaluate }, 'owned.dem'), error => error === primary && error.cleanupErrors[0].message === 'cleanup disconnected');
  await assert.rejects(dropDiskFile({ send, evaluate: async expression => { if (expression.includes('?.remove()')) throw new Error('cleanup only'); } }, 'owned.dem'), AggregateError);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
const require = createRequire(import.meta.url), { transformSync } = createRequire(require.resolve('vite'))('esbuild');
async function harness() {
  const handlers = new Map(), workers = [], windows = [];
  class Window extends EventEmitter { constructor() { super(); this.webContents = Object.assign(new EventEmitter(), { mainFrame: {}, send() {}, setWindowOpenHandler() {} }); windows.push(this); } isDestroyed() { return false; } removeMenu() {} async loadFile() {} close() { this.emit('closed'); } static getAllWindows() { return windows; } }
  const app = Object.assign(new EventEmitter(), { whenReady: () => Promise.resolve(), setAppUserModelId() {}, isPackaged: false });
  const electron = { app, BrowserWindow: Window, dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, utilityProcess: { fork: () => { const worker = Object.assign(new EventEmitter(), { sent: [], killed: false, postMessage(v) { this.sent.push(v); }, kill() { this.killed = true; } }); workers.push(worker); return worker; } } };
  const file = new URL('../electron/main.ts', import.meta.url), code = transformSync(readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs', define: { 'import.meta.url': JSON.stringify(file.href), '__CS2_ANALYST_TEST_SEAM__': 'false' } }).code;
  vm.runInNewContext(code, { require: n => n === 'electron' ? electron : require(n), process: { platform: 'win32', env: {} }, console, URL, Buffer, setTimeout, clearTimeout });
  await new Promise(r => setImmediate(r));
  const window = windows[0], trusted = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  // Drive the analyze handshake so an accepted path really produces a report.
  const finish = async promise => {
    const worker = workers.at(-1); worker.emit('spawn');
    const sessionId = worker.sent[0].sessionId;
    worker.emit('message', { kind: 'success', report: { replay: { available: true, sessionId, matchId: 'match', rounds: [{ round: 1, blocks: [{ index: 0 }] }] } } });
    return { result: await promise, sessionId };
  };
  return { handlers, workers, window, trusted, finish };
}
test('dragged DEM import guards sender/frame/path shape and reuses the shared analyze pipeline', async () => {
  const h = await harness();
  for (const event of [{ sender: {}, senderFrame: h.trusted.senderFrame }, { sender: h.trusted.sender, senderFrame: {} }, {}]) {
    assert.equal((await h.handlers.get('report:import-file')(event, 'C:\\demo.dem')).kind, 'error', 'untrusted frames are rejected');
  }
  for (const path of [null, 42, {}, [], '', '   ', 'relative.dem', '../demo.dem']) {
    assert.equal((await h.handlers.get('report:import-file')(h.trusted, path)).kind, 'error', `rejected path: ${String(path)}`);
  }
  assert.equal(h.workers.length, 0, 'invalid paths never spawn an analyze worker');
  const wrongExt = await h.handlers.get('report:import-file')(h.trusted, 'C:\\demo.txt');
  assert.equal(wrongExt.kind, 'error');
  assert.equal(wrongExt.message, '请选择 .dem 文件。');
  assert.equal(h.workers.length, 0, 'non-.dem extension never spawns an analyze worker');
  const { result, sessionId } = await h.finish(h.handlers.get('report:import-file')(h.trusted, 'C:\\match\\demo.dem'));
  assert.equal(result.kind, 'success', 'absolute .dem path runs the same pipeline as the dialog');
  assert.equal(result.report.replay.sessionId, sessionId);
  h.window.close();
});
test('a dragged import and a dialog import never run at the same time', async () => {
  const h = await harness();
  const pending = h.handlers.get('report:import-file')(h.trusted, 'C:\\demo.dem');
  const busy = await h.handlers.get('report:import')(h.trusted);
  assert.equal(busy.kind, 'error'); assert.equal(busy.message, '已有分析任务正在运行。');
  const busyFile = await h.handlers.get('report:import-file')(h.trusted, 'C:\\demo2.dem');
  assert.equal(busyFile.kind, 'error'); assert.equal(busyFile.message, '已有分析任务正在运行。');
  await h.finish(pending);
  h.window.close();
});

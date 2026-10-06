import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const desktop = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const demo = fileURLToPath(new URL('../.demo/demo1.dem', import.meta.url));
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const electron = require('electron');

assert.ok(existsSync(demo), `缺少测试 DEM：${demo}`);
assert.ok(existsSync(join(desktop, 'dist/electron/main.js')), '请先构建桌面应用（electron-vite build）');

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitFor(probe, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await delay(250);
  }
  throw new Error(`等待 ${label} 超时`);
}

/** Launches the built app with CS2_COACH_DEM_PATH so the import skips the native dialog. */
async function scenario({ label, demPath, ready, assertReport }) {
  const port = await freePort();
  const env = { ...process.env, CS2_COACH_DEM_PATH: demPath };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const child = spawn(electron, ['.', `--remote-debugging-port=${port}`], {
    cwd: desktop, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  let socket;
  try {
    let page;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`应用提前退出：${logs}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
        page = (await response.json()).find(target => target.type === 'page');
        if (page?.webSocketDebuggerUrl) break;
      } catch { /* Electron 尚未开放调试端口。 */ }
      await delay(200);
    }
    assert.ok(page?.webSocketDebuggerUrl, `等待窗口超时：${logs}`);
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let id = 0;
    const errors = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params);
    });
    const send = (method, params = {}) => {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.removeEventListener('message', onMessage); reject(new Error(`${method} 超时`)); }, 20_000);
        function onMessage(event) {
          const message = JSON.parse(event.data);
          if (message.id !== requestId) return;
          clearTimeout(timer);
          socket.removeEventListener('message', onMessage);
          if (message.error) reject(new Error(JSON.stringify(message.error)));
          else resolve(message.result);
        }
        socket.addEventListener('message', onMessage);
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    };
    const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;
    await send('Runtime.enable');
    await send('Page.enable');

    const shell = await waitFor(async () => {
      const state = await evaluate('({ ready: document.readyState, text: document.body.textContent, node: typeof window.require, version: window.cs2Coach?.version })');
      return state?.ready === 'complete' && state.text?.includes('CS2 Coach') ? state : null;
    }, 30_000, 'React 页面');
    assert.equal(shell.node, 'undefined', '渲染进程不应暴露 Node.js');
    assert.equal(shell.version, '0.1.0', 'preload 桥接未加载');

    const clicked = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('选择 DEM')); b?.click(); return Boolean(b); })()`);
    assert.equal(clicked, true, '未找到“选择 DEM”按钮');
    const body = await waitFor(async () => {
      const text = await evaluate('document.body.textContent');
      return ready(text) ? text : null;
    }, 120_000, label);
    assertReport(body);
    assert.deepEqual(errors, [], '页面存在未捕获异常');
    console.log(`${label}：通过`);

    socket.send(JSON.stringify({ id: ++id, method: 'Browser.close' }));
    for (let attempt = 0; attempt < 50 && child.exitCode === null; attempt++) await delay(100);
    assert.equal(child.exitCode, 0, '关闭窗口后应用未正常退出');
  } catch (error) {
    throw new Error(`${label} 失败
${logs}`, { cause: error });
  } finally {
    socket?.close();
    if (child.exitCode === null && child.pid) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else child.kill();
    }
  }
}

await scenario({
  label: '真实 DEM 报告',
  demPath: demo,
  ready: text => text.includes('twinkle') && text.includes('25 / 20 / 4'),
  assertReport: text => {
    for (const expected of ['de_dust2', '13 : 11', 'twinkle', '25 / 20 / 4', '91.38', '75%', '22.2%',
      'CT 方伤害影响明显低于 T 方', '本场死亡被交易比例偏低', '本场多次闪到队友',
      'R24 1v3 残局获胜', '本场首杀对决贡献突出', '重新选择 DEM']) {
      assert.ok(text.includes(expected), `报告缺少内容：${expected}`);
    }
  },
});

const dir = mkdtempSync(join(tmpdir(), 'cs2-coach-smoke-'));
try {
  const broken = join(dir, 'broken.dem');
  writeFileSync(broken, 'this is not a cs2 demo');
  await scenario({
    label: '损坏 DEM 错误处理',
    demPath: broken,
    ready: text => text.includes('无法分析此 DEM'),
    assertReport: text => {
      assert.ok(text.includes('CS2 Coach'), '错误后页面不应白屏');
      assert.ok(text.includes('重新选择 DEM'), '错误后应保留重新选择入口');
    },
  });
  const notDemo = join(dir, 'notes.txt');
  writeFileSync(notDemo, 'plain text');
  await scenario({
    label: '非 .dem 扩展名拒绝',
    demPath: notDemo,
    ready: text => text.includes('请选择 .dem 文件'),
    assertReport: text => {
      assert.ok(text.includes('重新选择 DEM'), '拒绝后应保留重新选择入口');
    },
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const desktop = fileURLToPath(new URL('../apps/desktop/', import.meta.url));
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url));
const cli = fileURLToPath(new URL('./cli.js', pathToFileURL(require.resolve('electron-vite'))));

async function smoke(mode) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const profile = mkdtempSync(join(tmpdir(), 'cs2-analyst-shell-profile-'));
  const child = spawn(process.execPath, [cli, mode, '--', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], {
    cwd: desktop,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  let spawnError;
  child.on('error', (error) => { spawnError = error; });
  child.stdout.on('data', (data) => { logs += data; });
  child.stderr.on('data', (data) => { logs += data; });
  let socket;
  try {
    let page;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`应用提前退出：${logs}`);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
          signal: AbortSignal.timeout(1000),
        });
        page = (await response.json()).find((target) => target.type === 'page');
        if (page?.webSocketDebuggerUrl) break;
      } catch { /* Electron 尚未启动调试端口。 */ }
      await delay(200);
    }
    assert.ok(page?.webSocketDebuggerUrl, `等待窗口超时：${logs}`);
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let id = 0;
    function send(method, params = {}) {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          socket.removeEventListener('message', onMessage);
          reject(new Error(`${method} 超时`));
        }, 30_000);
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
    }
    const errors = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params);
      if (message.method === 'Network.loadingFailed') errors.push(message.params);
    });
    await send('Runtime.enable');
    await send('Network.enable');
    let state;
    async function waitForPage() {
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await send('Runtime.evaluate', {
          expression: '({ ready: document.readyState, text: document.getElementById("root")?.textContent, version: window.cs2Analyst?.version, importDemo: typeof window.cs2Analyst?.importDemo, url: location.href, node: typeof window.require })',
          returnByValue: true,
        });
        state = result.result.value;
        if (state?.ready === 'complete' && state.text?.includes('CS2 Analyst') && state.version === '0.1.0') return;
        await delay(200);
      }
    }
    // 等首次导航完成后再刷新，避免取消主进程正在等待的 loadURL。
    await waitForPage();
    assert.equal(state?.ready, 'complete', '首次导航未完成');
    await send('Page.enable');
    const loaded = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.removeEventListener('message', onLoad);
        reject(new Error('刷新页面超时'));
      }, 30_000);
      function onLoad(event) {
        if (JSON.parse(event.data).method !== 'Page.loadEventFired') return;
        clearTimeout(timer);
        socket.removeEventListener('message', onLoad);
        resolve();
      }
      socket.addEventListener('message', onLoad);
    });
    await send('Page.reload');
    await loaded;
    await waitForPage();
    assert.ok(state?.text?.includes('CS2 Analyst'), 'React 页面未渲染');
    assert.ok(state.text.includes('选择 DEM'), '“选择 DEM”入口未渲染');
    assert.equal(state.version, '0.1.0', 'preload 桥接未加载');
    assert.equal(state.importDemo, 'function', 'preload importDemo 未暴露');
    assert.equal(state.node, 'undefined', '渲染页面不应开放 Node.js');
    assert.match(state.url, mode === 'dev' ? /^http:\/\/localhost:/ : /^file:\/\//);
    const assetUrls = mode === 'dev'
      ? ['weapons', 'death-notice'].flatMap(folder => readdirSync(join(desktop, 'renderer/src/assets/killfeed', folder)).filter(f => f.endsWith('.svg')).map(f => '/src/assets/killfeed/' + folder + '/' + f))
      : readdirSync(join(desktop, 'dist/renderer/assets')).filter(f => f.endsWith('.svg')).map(f => './assets/' + f);
    const imageResult = await send('Runtime.evaluate', {
      expression: `Promise.all(${JSON.stringify(assetUrls)}.map(async src => { const i = new Image(); i.src = new URL(src, location.href).href; await i.decode(); return i.complete && i.naturalWidth > 0; }))`,
      awaitPromise: true, returnByValue: true,
    });
    assert.ok(!imageResult.exceptionDetails && imageResult.result.value?.length === assetUrls.length && imageResult.result.value.every(Boolean), '官方图片必须全部可加载');
    assert.deepEqual(errors, [], '存在页面异常或资源加载失败');
    // Electron 退出时会断开协议连接，关闭命令无需等待响应。
    socket.send(JSON.stringify({ id: ++id, method: 'Browser.close' }));
    for (let attempt = 0; attempt < 300 && child.exitCode === null; attempt++) {
      await delay(100);
    }
    assert.equal(child.exitCode, 0, '关闭窗口后应用未正常退出');
    console.log(`${mode}: 页面渲染、preload、资源加载和关闭窗口验证通过`);
  } catch (error) {
    throw new Error(`${mode} 冒烟测试失败\n${logs}`, { cause: error });
  } finally {
    socket?.close();
    if (child.exitCode === null && child.pid) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      } else {
        child.kill();
      }
    }
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

await smoke('dev');
// dev 会生成开发产物，重新构建后再验证本地生产页面。
const build = spawnSync(process.execPath, [cli, 'build'], { cwd: desktop, stdio: 'inherit', windowsHide: true });
assert.equal(build.status, 0, '生产构建失败');
await smoke('preview');

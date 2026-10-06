import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

/**
 * Installed-app smoke for the Windows packaging MVP.
 *
 *   pnpm --filter @cs2-coach/desktop pack:win        (production installer)
 *   pnpm --filter @cs2-coach/desktop pack:win:test   (test-seam installer)
 *   pnpm --filter @cs2-coach/desktop test:installed
 *
 * It silently installs each NSIS artifact into .tmp/installed-smoke, inspects the
 * installed layout and app.asar, drives the packaged app over the Electron debugging
 * protocol, and uninstalls again. The production artifact is checked for the complete
 * absence of the test seam, so an installed production build cannot import an injected
 * DEM path.
 */

const root = fileURLToPath(new URL('../', import.meta.url));
const desktopDir = join(root, 'apps/desktop');
const demo = join(root, '.demo/demo1.dem');
const workDir = join(root, '.tmp/installed-smoke');
const brokenDemo = join(workDir, 'broken.dem');

const version = JSON.parse(readFileSync(join(desktopDir, 'package.json'), 'utf8')).version;
const APP_EXE = 'CS2 Coach.exe';
const UNINSTALLER = 'Uninstall CS2 Coach.exe';
const SEAM_MARKER = 'CS2_COACH_TEST_DEM_PATH';
const NATIVE_TRIPLE = 'win32-x64-msvc';

const variants = {
  production: {
    label: '生产安装包',
    installer: join(root, 'release', version, 'CS2-Coach-Setup-' + version + '.exe'),
    installDir: join(workDir, 'app-production'),
  },
  'test-seam': {
    label: '测试 seam 安装包',
    installer: join(root, '.tmp/test-output', version, 'CS2-Coach-TestSeam-Setup-' + version + '.exe'),
    installDir: join(workDir, 'app-test-seam'),
  },
};

/** P5.2.1 product polish: these tokens must never reach the rendered UI. */
const STIFF_ENGLISH = [/\bUtility\b/, /\bFlash\b/, /\bSmoke\b/, /\bHE\b/, /\bIncendiary\b/, /\bMolotov\b/, /\bDecoy\b/, /\bduration\b/i, /\btraded\b/i, /\btradeable\b/i, /可交易/, /被交易/, /\bwin\b/, /\bloss\b/];
function assertNoStiffEnglish(text) {
  for (const pattern of STIFF_ENGLISH) assert.ok(!pattern.test(text), 'UI 出现生硬英文或旧术语：' + pattern);
}

// ---------------------------------------------------------------- process helpers

function runSync(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.error) throw result.error;
  return result;
}

async function waitFor(probe, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value) return value;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error('等待 ' + label + ' 超时' + (lastError ? '：' + lastError.message : ''));
}

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

/** Processes still running from the installed app. Utility Process workers share the image name. */
function appProcesses() {
  const result = runSync('tasklist', ['/FI', 'IMAGENAME eq ' + APP_EXE, '/FO', 'CSV', '/NH']);
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(line => line.toLowerCase().startsWith('"cs2 coach.exe"'));
}

function killAppProcesses() {
  runSync('taskkill', ['/IM', APP_EXE, '/T', '/F']);
}

// ---------------------------------------------------------------- asar inspection

/** Minimal ASAR reader: the header is a pickle containing a JSON directory tree. */
function readAsar(archive) {
  const fd = openSync(archive, 'r');
  try {
    const sizeBuf = Buffer.alloc(8);
    readSync(fd, sizeBuf, 0, 8, 0);
    const headerSize = sizeBuf.readUInt32LE(4);
    const headerBuf = Buffer.alloc(headerSize);
    readSync(fd, headerBuf, 0, headerSize, 8);
    const jsonLength = headerBuf.readUInt32LE(4);
    const header = JSON.parse(headerBuf.subarray(8, 8 + jsonLength).toString('utf8'));
    const files = new Map();
    const walk = (node, prefix) => {
      for (const [name, value] of Object.entries(node.files ?? {})) {
        const entry = prefix ? prefix + '/' + name : name;
        if (value.files) walk(value, entry);
        else files.set(entry, value);
      }
    };
    walk(header, '');
    return { files, dataOffset: 8 + headerSize };
  } finally {
    closeSync(fd);
  }
}

function readAsarFile(archive, dataOffset, info) {
  const size = Number(info.size);
  const fd = openSync(archive, 'r');
  try {
    const buffer = Buffer.alloc(size);
    readSync(fd, buffer, 0, size, dataOffset + Number(info.offset));
    return buffer;
  } finally {
    closeSync(fd);
  }
}

// ---------------------------------------------------------------- install lifecycle

async function install(variant) {
  assert.ok(existsSync(variant.installer), '缺少安装包：' + variant.installer + '（先运行 pnpm --filter @cs2-coach/desktop pack:win 和 pack:win:test）');
  const installerSize = (statSync(variant.installer).size / 1024 / 1024).toFixed(1);
  rmSync(variant.installDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  mkdirSync(variant.installDir, { recursive: true });
  const result = runSync(variant.installer, ['/S', '/D=' + variant.installDir]);
  assert.equal(result.status, 0, variant.label + ' 静默安装退出码异常：' + result.status + ' ' + result.stderr);
  await waitFor(() => existsSync(join(variant.installDir, APP_EXE)), 120_000, variant.label + ' 安装完成');
  console.log(variant.label + '：安装成功 → ' + variant.installDir + '（安装包 ' + installerSize + ' MB）');
}

async function uninstall(variant) {
  const uninstaller = join(variant.installDir, UNINSTALLER);
  assert.ok(existsSync(uninstaller), variant.label + ' 缺少卸载器：' + uninstaller);
  const result = runSync(uninstaller, ['/S']);
  assert.equal(result.status, 0, variant.label + ' 卸载退出码异常：' + result.status);
  await waitFor(() => !existsSync(join(variant.installDir, APP_EXE)), 120_000, variant.label + ' 卸载完成');
  console.log(variant.label + '：卸载成功');
}

// ---------------------------------------------------------------- app driving

async function launchSession(exePath, extraEnv, label) {
  const port = await freePort();
  const env = { ...process.env, ...extraEnv };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const child = spawn(exePath, ['--remote-debugging-port=' + port], { cwd: join(exePath, '..'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  let socket;
  try {
    const page = await waitFor(async () => {
      if (child.exitCode !== null) throw new Error('应用提前退出：' + logs);
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(1000) });
        const targets = await response.json();
        const found = targets.find(target => target.type === 'page');
        return found?.webSocketDebuggerUrl ? found : null;
      } catch {
        return null;
      }
    }, 60_000, label + ' 打开调试端口');

    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    let id = 0;
    const errors = [];
    const send = (method, params = {}) => {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.removeEventListener('message', onMessage); reject(new Error(method + ' 超时')); }, 20_000);
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
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params);
    });
    await send('Runtime.enable');
    await send('Page.enable');
    const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

    const shell = await waitFor(async () => {
      const state = await evaluate('({ ready: document.readyState, text: document.body.textContent, node: typeof window.require, nodeProcess: typeof window.process, version: window.cs2Coach?.version })');
      return state?.ready === 'complete' && state.text?.includes('CS2 Coach') ? state : null;
    }, 60_000, label + ' React 页面');
    return { child, send, evaluate, errors, shell };
  } catch (error) {
    socket?.close();
    if (child.exitCode === null) killAppProcesses();
    throw new Error(label + ' 启动失败\n' + logs, { cause: error });
  }
}

async function clickSelectDemo(session) {
  const clicked = await session.evaluate("(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('选择 DEM')); b?.click(); return Boolean(b); })()");
  assert.equal(clicked, true, '未找到“选择 DEM”按钮');
}

async function closeGracefully(session) {
  session.send('Browser.close').catch(() => { /* Electron 退出时会断开协议连接。 */ });
  for (let attempt = 0; attempt < 150 && session.child.exitCode === null; attempt++) await delay(100);
  return session.child.exitCode;
}

// ---------------------------------------------------------------- checks

function checkInstalledLayout(variant, expectSeam) {
  const resources = join(variant.installDir, 'resources');
  const asar = join(resources, 'app.asar');
  assert.ok(existsSync(asar), '缺少 resources/app.asar');
  const asarSizeMb = statSync(asar).size / 1024 / 1024;
  assert.ok(asarSizeMb < 25, 'app.asar 体积异常（' + asarSizeMb.toFixed(1) + ' MB），可能打进了 monorepo 或测试数据');

  const { files, dataOffset } = readAsar(asar);
  const entries = [...files.keys()];
  for (const entry of entries) {
    assert.ok(entry === 'package.json' || entry.startsWith('dist/'), 'app.asar 含非应用内容：' + entry);
  }
  for (const required of ['dist/electron/main.js', 'dist/electron/report-worker.js', 'dist/electron/node_modules/@laihoe/demoparser2/index.js', 'dist/preload/index.cjs', 'dist/renderer/index.html']) {
    assert.ok(files.has(required), 'app.asar 缺少 ' + required);
  }
  const nativeRelative = 'dist/electron/node_modules/@laihoe/demoparser2-' + NATIVE_TRIPLE + '/demoparser2.' + NATIVE_TRIPLE + '.node';
  const nativeEntries = entries.filter(entry => entry.endsWith('.node'));
  assert.deepEqual(nativeEntries, [nativeRelative], 'app.asar 应只登记一个原生绑定，且位于 worker 的 node_modules');
  assert.equal(files.get(nativeRelative).unpacked, true, '原生绑定必须以 unpacked 形式打包到 app.asar.unpacked');
  assert.ok(!entries.some(entry => entry.toLowerCase().includes('demo1.dem')), 'app.asar 不应包含测试 DEM');

  const native = join(resources, 'app.asar.unpacked', 'dist', 'electron', 'node_modules', '@laihoe', 'demoparser2-' + NATIVE_TRIPLE, 'demoparser2.' + NATIVE_TRIPLE + '.node');
  assert.ok(existsSync(native), '缺少 unpacked 原生绑定：' + native);
  const nativeMb = statSync(native).size / 1024 / 1024;
  assert.ok(nativeMb > 3, '原生绑定体积异常：' + nativeMb.toFixed(1) + ' MB');

  const mainSource = readAsarFile(asar, dataOffset, files.get('dist/electron/main.js')).toString('utf8');
  const workerSource = readAsarFile(asar, dataOffset, files.get('dist/electron/report-worker.js')).toString('utf8');
  const rendererEntry = entries.find(entry => /^dist\/renderer\/assets\/index-.*\.js$/.test(entry));
  assert.ok(rendererEntry, '缺少 renderer bundle');
  const rendererSource = readAsarFile(asar, dataOffset, files.get(rendererEntry)).toString('utf8');

  if (expectSeam) {
    assert.ok(mainSource.includes(SEAM_MARKER), '测试 seam 构建应包含 ' + SEAM_MARKER);
  } else {
    assert.ok(!mainSource.includes(SEAM_MARKER), '生产安装包不得包含路径注入 seam');
  }
  for (const forbidden of ['demoparser2', 'laihoe', '@cs2-coach/analytics', '@cs2-coach/dem-parser']) {
    assert.ok(!rendererSource.includes(forbidden), 'renderer bundle 不应包含 ' + forbidden);
  }
  assert.ok(workerSource.includes('@laihoe/demoparser2'), 'worker bundle 应引用原生 parser');
  assert.ok(!workerSource.includes('@cs2-coach/'), 'worker bundle 不应外部依赖 workspace 包');

  console.log(variant.label + '：asar ' + asarSizeMb.toFixed(2) + ' MB、' + entries.length + ' 个条目、原生绑定 ' + nativeMb.toFixed(1) + ' MB unpacked、renderer 无 Node/原生 parser');
}

function checkShortcut() {
  const candidates = [
    join(process.env.APPDATA ?? '', 'Microsoft/Windows/Start Menu/Programs/CS2 Coach.lnk'),
    join(process.env.USERPROFILE ?? '', 'Desktop/CS2 Coach.lnk'),
  ];
  const found = candidates.filter(candidate => candidate && existsSync(candidate));
  console.log('快捷方式：' + (found.length ? found.join('；') : '未在默认位置找到（可能被系统重定向）'));
}

// ---------------------------------------------------------------- scenarios

async function productionScenario() {
  const variant = variants.production;
  await install(variant);
  try {
    checkInstalledLayout(variant, false);
    checkShortcut();
    const exe = join(variant.installDir, APP_EXE);

    // 1. 正常启动 / Renderer 无 Node 暴露 / 正常关闭。
    const session = await launchSession(exe, {}, variant.label);
    assert.equal(session.shell.node, 'undefined', '渲染进程不应暴露 Node.js');
    assert.equal(session.shell.nodeProcess, 'undefined', '渲染进程不应暴露 process');
    assert.equal(session.shell.version, version, 'preload 桥接未加载');
    const exitCode = await closeGracefully(session);
    assert.equal(exitCode, 0, '关闭窗口后应用未正常退出');
    await waitFor(() => appProcesses().length === 0, 15_000, '应用进程退出');
    console.log(variant.label + '：启动、preload 桥接、无 Node 暴露、正常关闭通过');

    // 2. 环境变量注入在正式安装版必须无效：点击选择 DEM 后仍走原生对话框，不自动导入。
    killAppProcesses();
    const injected = await launchSession(exe, { CS2_COACH_DEM_PATH: demo, CS2_COACH_TEST_DEM_PATH: demo }, variant.label + '（注入测试）');
    await clickSelectDemo(injected);
    await waitFor(async () => {
      const text = await injected.evaluate('document.body.textContent');
      return text?.includes('正在选择 DEM') ? text : null;
    }, 20_000, '选择阶段');
    await delay(15_000);
    const afterWait = await injected.evaluate('document.body.textContent');
    assert.ok(!afterWait.includes('twinkle') && !afterWait.includes('25 / 20 / 4'), '正式安装版不得接受注入的 DEM 路径');
    assert.ok(afterWait.includes('CS2 Coach'), '页面不应白屏');
    killAppProcesses();
    await waitFor(() => appProcesses().length === 0, 15_000, '强制结束应用进程');
    console.log(variant.label + '：注入 DEM 路径无效，正式安装版只能通过原生文件对话框选择');
  } finally {
    killAppProcesses();
    await uninstall(variant);
  }
}

async function testSeamScenario() {
  const variant = variants['test-seam'];
  await install(variant);
  try {
    checkInstalledLayout(variant, true);
    const exe = join(variant.installDir, APP_EXE);

    // 3. 真实 demo1.dem 全链路报告。
    const session = await launchSession(exe, { CS2_COACH_TEST_DEM_PATH: demo }, variant.label);
    await clickSelectDemo(session);
    const body = await waitFor(async () => {
      const text = await session.evaluate('document.body.textContent');
      return text?.includes('25 / 20 / 4') ? text : null;
    }, 300_000, variant.label + ' demo1 报告');
    for (const expected of ['de_dust2', '13 : 11', 'twinkle', '25 / 20 / 4', '91.38', '75%', '22.2%',
      'CT 方 ADR 明显低于 T 方', '死亡后队友补枪偏少', '本场多次闪到队友', 'R24 1v3 残局获胜',
      '本场首杀对决贡献突出', '重新选择 DEM']) {
      assert.ok(body.includes(expected), '报告缺少内容：' + expected);
    }
    const findingCount = await session.evaluate("document.querySelectorAll('[data-rule]').length");
    assert.equal(findingCount, 5, 'twinkle 应显示 5 条 Findings');
    assertNoStiffEnglish(body);
    assert.deepEqual(session.errors, [], '页面存在未捕获异常');
    const exitCode = await closeGracefully(session);
    assert.equal(exitCode, 0, '关闭窗口后应用未正常退出');
    await waitFor(() => appProcesses().length === 0, 20_000, '分析结束后无残留进程');
    console.log(variant.label + '：demo1 报告与开发环境一致（twinkle 25/20/4、ADR 91.38、KAST 75%、Trade 22.2%、R24 1v3 win、5 条 Findings）');

    // 4. 分析进行中关闭应用不得残留 analysis worker。
    killAppProcesses();
    const mid = await launchSession(exe, { CS2_COACH_TEST_DEM_PATH: demo }, variant.label + '（中途关闭）');
    await clickSelectDemo(mid);
    await waitFor(async () => {
      const text = await mid.evaluate('document.body.textContent');
      return text?.includes('正在后台解析 DEM') || text?.includes('正在生成指标') ? text : null;
    }, 60_000, variant.label + ' 进入解析阶段');
    await waitFor(() => appProcesses().length >= 2, 30_000, variant.label + ' Utility Process 启动');
    const midExit = await closeGracefully(mid);
    assert.equal(midExit, 0, '分析中途关闭窗口应正常退出');
    await waitFor(() => appProcesses().length === 0, 20_000, variant.label + ' 无残留 analysis worker');
    console.log(variant.label + '：分析中途关闭应用后无残留 analysis worker');

    // 5. 损坏 DEM 仍显示错误且不白屏。
    killAppProcesses();
    const broken = await launchSession(exe, { CS2_COACH_TEST_DEM_PATH: brokenDemo }, variant.label + '（损坏 DEM）');
    await clickSelectDemo(broken);
    const errorText = await waitFor(async () => {
      const text = await broken.evaluate('document.body.textContent');
      return text?.includes('无法分析此 DEM') ? text : null;
    }, 90_000, variant.label + ' 损坏 DEM 错误');
    assert.ok(errorText.includes('重新选择 DEM'), '错误后应保留重新选择入口');
    assert.ok(errorText.includes('CS2 Coach'), '错误后页面不应白屏');
    assertNoStiffEnglish(errorText);
    await closeGracefully(broken);
    console.log(variant.label + '：损坏 DEM 显示错误且不白屏');
  } finally {
    killAppProcesses();
    await uninstall(variant);
  }
}

// ---------------------------------------------------------------- entry

assert.ok(existsSync(demo), '缺少测试 DEM：' + demo + '（.demo/demo1.dem）');
rmSync(workDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
mkdirSync(workDir, { recursive: true });
writeFileSync(brokenDemo, 'this is not a cs2 demo');
killAppProcesses();

try {
  await productionScenario();
  await testSeamScenario();
  console.log('installed-app smoke 全部通过');
} finally {
  killAppProcesses();
}

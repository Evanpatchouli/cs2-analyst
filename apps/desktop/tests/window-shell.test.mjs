import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve('vite'))('esbuild');
function execute(file, electron, extra = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const code = transformSync(source, { loader: 'ts', format: 'cjs', define: {
    'import.meta.url': JSON.stringify(new URL(file, import.meta.url).href), '__CS2_COACH_TEST_SEAM__': 'false',
  } }).code;
  vm.runInNewContext(code, { require: name => name === 'electron' ? electron : require(name),
    process: { platform: 'win32', env: { CS2_COACH_DEM_PATH: 'sample.dem' } }, URL, console, setTimeout, clearTimeout, ...extra });
}

test('frameless window preserves sandbox and guards every privileged window action', async () => {
  const handlers = new Map();
  const windows = [];
  const calls = [];
  let worker;
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.maximized = false; this.destroyed = false;
      this.webContents = Object.assign(new EventEmitter(), { mainFrame: {},
        send: (...args) => calls.push(args), setWindowOpenHandler() {} }); windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    removeMenu() { this.menuRemoved = true; }
    isMaximized() { return this.maximized; }
    maximize() { this.maximized = true; calls.push('maximize'); this.emit('maximize'); }
    unmaximize() { this.maximized = false; calls.push('unmaximize'); this.emit('unmaximize'); }
    minimize() { calls.push('minimize'); }
    close() { calls.push('close'); this.destroyed = true; this.emit('closed'); }
    async loadFile() {}
    static getAllWindows() { return windows; }
  }
  const app = Object.assign(new EventEmitter(), { whenReady: () => Promise.resolve(), quit: () => calls.push('quit'), isPackaged: false });
  execute('../electron/main.ts', { app, BrowserWindow: Window, dialog: {},
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, utilityProcess: { fork: () => {
      worker = Object.assign(new EventEmitter(), { kill: () => calls.push('kill-worker'), postMessage() {} }); return worker;
    } } });
  await new Promise(resolve => setImmediate(resolve));
  const window = windows[0];
  assert.equal(window.options.frame, false);
  assert.equal(window.menuRemoved, true);
  assert.equal(window.options.resizable, true);
  for (const [key, value] of Object.entries({ width: 1280, height: 800, minWidth: 800, minHeight: 600, backgroundColor: '#111821' })) assert.equal(window.options[key], value);
  for (const [key, value] of Object.entries({ contextIsolation: true, nodeIntegration: false, sandbox: true })) assert.equal(window.options.webPreferences[key], value);
  assert.equal(window.options.titleBarOverlay, undefined);
  const trusted = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  for (const event of [{ sender: {}, senderFrame: trusted.senderFrame }, { sender: trusted.sender, senderFrame: {} }, {}]) {
    const before = calls.length;
    for (const name of ['window:minimize', 'window:toggle-maximize', 'window:close']) await handlers.get(name)(event);
    assert.equal(await handlers.get('window:is-maximized')(event), false);
    assert.equal((await handlers.get('report:import')(event)).kind, 'error');
    assert.equal(calls.length, before);
  }
  await handlers.get('window:minimize')(trusted);
  await handlers.get('window:toggle-maximize')(trusted);
  assert.equal(await handlers.get('window:is-maximized')(trusted), true);
  assert.deepEqual(calls.at(-1), ['window:maximized-changed', true]);
  // Native/system events follow the same notification path as caption clicks.
  window.unmaximize();
  assert.deepEqual(calls.at(-1), ['window:maximized-changed', false]);
  window.maximize();
  await handlers.get('window:toggle-maximize')(trusted);
  assert.equal(window.maximized, false);
  const importing = handlers.get('report:import')(trusted);
  await handlers.get('window:close')(trusted);
  assert.ok(calls.includes('kill-worker'), 'closing during analysis kills its worker');
  assert.ok(!calls.includes('quit'), 'caption close calls the window, not app.quit');
  worker.emit('exit'); await importing;
  const before = calls.length;
  await handlers.get('window:minimize')(trusted);
  assert.equal(calls.length, before, 'closed/stale sender cannot operate a window');
});

test('preload exposes only named window operations and removes the exact event listener', async () => {
  let api;
  const calls = [];
  const ipcRenderer = Object.assign(new EventEmitter(), { invoke: async name => { calls.push(name); return name === 'window:is-maximized'; } });
  execute('../preload/index.ts', { ipcRenderer, contextBridge: { exposeInMainWorld: (name, value) => { assert.equal(name, 'cs2Coach'); api = value; } } });
  await api.window.minimize(); await api.window.toggleMaximize(); await api.window.close();
  assert.equal(await api.window.isMaximized(), true);
  assert.deepEqual(calls, ['window:minimize', 'window:toggle-maximize', 'window:close', 'window:is-maximized']);
  const values = [];
  const dispose = api.window.onMaximizedChange(value => values.push(value));
  ipcRenderer.emit('window:maximized-changed', {}, true);
  ipcRenderer.emit('window:maximized-changed', {}, false);
  dispose();
  ipcRenderer.emit('window:maximized-changed', {}, true);
  assert.deepEqual(values, [true, false]);
  assert.equal(ipcRenderer.listenerCount('window:maximized-changed'), 0);
});

import { app, BrowserWindow, dialog, ipcMain, utilityProcess } from 'electron';
import { fileURLToPath } from 'node:url';
import { extname } from 'node:path';
import type { ImportPhase, ImportResult } from '@cs2-coach/report-contract';

/** Replaced at build time by electron.vite.config.ts. False in production installers. */
declare const __CS2_COACH_TEST_SEAM__: boolean;

let mainWindow: BrowserWindow | null = null;
let importing = false;
let activeWorker: Electron.UtilityProcess | null = null;

/** Only the current application's main frame can invoke privileged actions. */
function trustedWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  const window = mainWindow;
  return window && !window.isDestroyed() && event.sender === window.webContents
    && event.senderFrame === window.webContents.mainFrame ? window : null;
}

ipcMain.handle('window:minimize', event => { trustedWindow(event)?.minimize(); });
ipcMain.handle('window:toggle-maximize', event => {
  const window = trustedWindow(event);
  if (!window) return;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
});
ipcMain.handle('window:close', event => { trustedWindow(event)?.close(); });
ipcMain.handle('window:is-maximized', event => trustedWindow(event)?.isMaximized() ?? false);

/**
 * Import path used by automated tests instead of the native file dialog.
 *
 * `CS2_COACH_DEM_PATH` only applies to non-packaged builds. The packaged test seam
 * (`CS2_COACH_TEST_DEM_PATH`) is compiled in exclusively for the test-seam installer;
 * the production bundle contains neither the variable nor the branch, so an installed
 * production app can only import a DEM chosen through the native dialog.
 */
function injectedDemoPath(): string | undefined {
  if (__CS2_COACH_TEST_SEAM__) return process.env.CS2_COACH_TEST_DEM_PATH;
  if (!app.isPackaged) return process.env.CS2_COACH_DEM_PATH;
  return undefined;
}

function analyzeDemo(filePath: string, window: BrowserWindow): Promise<ImportResult> {
  return new Promise(resolve => {
    const worker = utilityProcess.fork(fileURLToPath(new URL('./report-worker.js', import.meta.url)), [], { serviceName: 'CS2 DEM Analysis' });
    activeWorker = worker;
    let settled = false;
    const finish = (result: ImportResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.removeAllListeners();
      worker.kill();
      if (activeWorker === worker) activeWorker = null;
      resolve(result);
    };
    const timeout = setTimeout(() => finish({ kind: 'error', message: '分析超时（10 分钟）。请重新选择 DEM。' }), 10 * 60_000);
    worker.on('spawn', () => worker.postMessage({ filePath }));
    worker.on('message', (message) => {
      if (message.kind === 'progress' && message.phase === 'analyzing') {
        if (!window.isDestroyed()) window.webContents.send('report:progress', 'analyzing');
      } else if (message.kind === 'success' || message.kind === 'error') finish(message);
    });
    worker.on('exit', () => finish({ kind: 'error', message: '分析进程意外退出。请重新选择 DEM。' }));
  });
}

ipcMain.handle('report:import', async (event): Promise<ImportResult> => {
  const window = trustedWindow(event);
  if (!window) {
    return { kind: 'error', message: '无效的报告请求。' };
  }
  if (importing) return { kind: 'error', message: '已有分析任务正在运行。' };
  importing = true;
  const progress = (phase: ImportPhase) => { if (!window.isDestroyed()) window.webContents.send('report:progress', phase); };
  try {
    progress('selecting');
    const injected = injectedDemoPath();
    let filePath: string;
    if (injected) {
      filePath = injected;
    } else {
      const result = await dialog.showOpenDialog(window, { title: '选择 CS2 DEM', properties: ['openFile'], filters: [{ name: 'CS2 Demo', extensions: ['dem'] }] });
      if (result.canceled || !result.filePaths.length || window.isDestroyed()) return { kind: 'cancelled' };
      filePath = result.filePaths[0];
    }
    if (extname(filePath).toLowerCase() !== '.dem') return { kind: 'error', message: '请选择 .dem 文件。' };
    progress('parsing');
    return await analyzeDemo(filePath, window);
  } catch (error) {
    console.error('DEM import failed', error);
    return { kind: 'error', message: '无法导入 DEM。请检查文件权限后重新选择。' };
  } finally {
    importing = false;
  }
});

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    resizable: true,
    backgroundColor: '#111821',
    title: 'CS2 Coach',
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const window = mainWindow;
  window.removeMenu();
  const maximizedChanged = () => {
    if (!window.isDestroyed()) window.webContents.send('window:maximized-changed', window.isMaximized());
  };
  window.on('maximize', maximizedChanged);
  window.on('unmaximize', maximizedChanged);

  mainWindow.on('closed', () => {
    activeWorker?.kill();
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)));
  }
}

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

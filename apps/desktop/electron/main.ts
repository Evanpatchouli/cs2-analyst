import { app, BrowserWindow, dialog, ipcMain, utilityProcess } from 'electron';
import { fileURLToPath } from 'node:url';
import { extname, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ImportPhase, ImportResult, DesktopReplayMetadata, DesktopReplayRequest, DesktopReplayResult } from '@cs2-analyst/report-contract';

/** Replaced at build time by electron.vite.config.ts. False in production installers. */
declare const __CS2_ANALYST_TEST_SEAM__: boolean;

let mainWindow: BrowserWindow | null = null;
let importing = false;
let activeWorker: Electron.UtilityProcess | null = null;
let activeReplay: DesktopReplayMetadata | null = null;
let cancelActiveImport: (() => void) | null = null;
let requestSequence = 0;
const pendingChunks = new Map<number, { worker: Electron.UtilityProcess; request: DesktopReplayRequest; timer: ReturnType<typeof setTimeout>; resolve: (result: DesktopReplayResult) => void }>();
function stopReplayWorker() {
  const worker=activeWorker;activeWorker=null;activeReplay=null;
  for(const [id,pending] of pendingChunks){clearTimeout(pending.timer);pending.resolve({kind:'error',message:'回放会话已结束。'});pendingChunks.delete(id);}
  worker?.removeAllListeners();worker?.kill();
}

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
ipcMain.handle('report:cancel', event => { if(trustedWindow(event)&&importing)cancelActiveImport?.(); });
ipcMain.handle('replay:release', (event, sessionId:unknown) => {
  if(trustedWindow(event)&&typeof sessionId==='string'&&sessionId===activeReplay?.sessionId)stopReplayWorker();
});
ipcMain.handle('replay:chunk', (event, value:unknown): Promise<DesktopReplayResult>|DesktopReplayResult => {
  const fail=():DesktopReplayResult=>({kind:'error',message:'无效或已过期的回放请求。'});
  if(!trustedWindow(event)||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3)return fail();
  const request=value as DesktopReplayRequest,session=activeReplay,worker=activeWorker;
  if(!worker||!session||request.sessionId!==session.sessionId||typeof request.sessionId!=='string'||request.sessionId.length!==36
    ||!Number.isSafeInteger(request.round)||request.round<1||!Number.isSafeInteger(request.block)||request.block<0||pendingChunks.size>=4)return fail();
  if(!session.rounds.find(r=>r.round===request.round)?.blocks.some(b=>b.index===request.block))return fail();
  return new Promise(resolve=>{
    const id=++requestSequence,timer=setTimeout(()=>{pendingChunks.delete(id);resolve({kind:'error',message:'回放数据请求超时。'});},15_000);
    pendingChunks.set(id,{worker,request:{...request},timer,resolve});
    try {worker.postMessage({kind:'replay-chunk',requestId:id,request});}
    catch {clearTimeout(timer);pendingChunks.delete(id);resolve(fail());}
  });
});

/**
 * Import path used by automated tests instead of the native file dialog.
 *
 * `CS2_ANALYST_DEM_PATH` only applies to non-packaged builds. The packaged test seam
 * (`CS2_ANALYST_TEST_DEM_PATH`) is compiled in exclusively for the test-seam installer;
 * the production bundle contains neither the variable nor the branch, so an installed
 * production app can only import a DEM chosen through the native dialog.
 */
function injectedDemoPath(): string | undefined {
  if (__CS2_ANALYST_TEST_SEAM__) return process.env.CS2_ANALYST_TEST_DEM_PATH;
  if (!app.isPackaged) return process.env.CS2_ANALYST_DEM_PATH;
  return undefined;
}

function analyzeDemo(filePath: string, window: BrowserWindow): Promise<ImportResult> {
  stopReplayWorker();
  return new Promise(resolve => {
    const sessionId=randomUUID();
    const worker = utilityProcess.fork(fileURLToPath(new URL('./report-worker.js', import.meta.url)), [], { serviceName: 'CS2 DEM Analysis' });
    activeWorker = worker;
    let settled = false;
    const finish = (result: ImportResult, retain = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if(cancelActiveImport===cancel)cancelActiveImport=null;
      if(!retain&&activeWorker===worker)stopReplayWorker();
      resolve(result);
    };
    const cancel=()=>finish({kind:'cancelled'});
    cancelActiveImport=cancel;
    const timeout = setTimeout(() => finish({ kind: 'error', message: '分析超时（10 分钟）。请重新选择 DEM。' }), 10 * 60_000);
    worker.on('spawn', () => worker.postMessage({ filePath, sessionId }));
    worker.on('message', (message) => {
      if(activeWorker!==worker)return;
      if(message.kind==='replay-chunk'){
        const pending=pendingChunks.get(message.requestId);if(!pending||pending.worker!==worker)return;
        const result=message.result as DesktopReplayResult;
        if(result?.kind==='success'){
          const chunk=result.chunk;
          if(chunk?.schemaVersion!==1||chunk?.matchId!==activeReplay?.matchId||chunk?.sessionId!==activeReplay?.sessionId||chunk?.sessionId!==pending.request.sessionId||chunk?.round!==pending.request.round||chunk?.block!==pending.request.block
            ||Buffer.byteLength(JSON.stringify(chunk))>1024*1024)return;
        }else if(result?.kind!=='error')return;
        clearTimeout(pending.timer);pendingChunks.delete(message.requestId);pending.resolve(result);return;
      }
      if(settled)return;
      if (message.kind === 'progress' && message.phase === 'analyzing') {
        if (!window.isDestroyed()) window.webContents.send('report:progress', 'analyzing');
      } else if (message.kind === 'success') {
        const metadata=message.report?.replay as DesktopReplayMetadata|undefined;
        const retain=metadata?.available===true&&metadata.sessionId===sessionId;
        activeReplay=retain?metadata!:null;finish(message,retain);
      } else if(message.kind==='error')finish(message);
    });
    worker.on('exit', () => { if(!settled)finish({ kind: 'error', message: '分析进程意外退出。请重新选择 DEM。' });else if(activeWorker===worker)stopReplayWorker(); });
  });
}

/** Shared tail of every import path: extension gate, parsing progress, worker analysis. */
async function analyzeFromPath(filePath: string, window: BrowserWindow): Promise<ImportResult> {
  if (extname(filePath).toLowerCase() !== '.dem') return { kind: 'error', message: '请选择 .dem 文件。' };
  if (!window.isDestroyed()) window.webContents.send('report:progress', 'parsing');
  return await analyzeDemo(filePath, window);
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
    return await analyzeFromPath(filePath, window);
  } catch (error) {
    console.error('DEM import failed', error);
    return { kind: 'error', message: '无法导入 DEM。请检查文件权限后重新选择。' };
  } finally {
    importing = false;
  }
});

/** Drag-and-drop import: same pipeline as the dialog, but the renderer supplies an absolute .dem path. */
ipcMain.handle('report:import-file', async (event, value: unknown): Promise<ImportResult> => {
  const window = trustedWindow(event);
  if (!window) return { kind: 'error', message: '无效的报告请求。' };
  if (typeof value !== 'string' || !value.trim() || !isAbsolute(value)) return { kind: 'error', message: '无效的 DEM 路径。' };
  if (importing) return { kind: 'error', message: '已有分析任务正在运行。' };
  importing = true;
  try {
    return await analyzeFromPath(value.trim(), window);
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
    // Comfortable working window on a 1080p desktop: the navigation rail, the
    // report split and the replay layout all stay intact down to this size.
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    resizable: true,
    backgroundColor: '#111821',
    title: 'CS2 Analyst',
    icon: app.isPackaged
      ? join(process.resourcesPath, 'branding/cs2-analyst-mark.png')
      : fileURLToPath(new URL('../../resources/branding/cs2-analyst-mark.png', import.meta.url)),
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
    cancelActiveImport?.();stopReplayWorker();
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
  app.setAppUserModelId(__CS2_ANALYST_TEST_SEAM__ ? 'com.evanpatchouli.cs2analyst.testseam' : 'com.evanpatchouli.cs2analyst');
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

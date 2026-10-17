import { app, BrowserWindow, dialog, ipcMain, utilityProcess } from 'electron';
import { fileURLToPath } from 'node:url';
import { extname, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ImportPhase, ImportResult, DesktopReplayMetadata, DesktopReplayRequest, DesktopReplayResult,
  DesktopHeatmapMetadata, DesktopHeatmapRequest, DesktopHeatmapResult } from '@cs2-analyst/report-contract';
import { HEATMAP_MAX_PENDING, HEATMAP_TIMEOUT_MS, validateHeatmapRequest, validateHeatmapResult } from '../shared/heatmap-ipc.ts';

/** Replaced at build time by electron.vite.config.ts. False in production installers. */
declare const __CS2_ANALYST_TEST_SEAM__: boolean;

let mainWindow: BrowserWindow | null = null;
let importing = false;
let activeWorker: Electron.UtilityProcess | null = null;
let activeReplay: DesktopReplayMetadata | null = null;
let activeHeatmap: DesktopHeatmapMetadata | null = null;
let activeSessionId: string | null = null;
let cancelActiveImport: (() => void) | null = null;
let requestSequence = 0;
const pendingChunks = new Map<number, { worker: Electron.UtilityProcess; request: DesktopReplayRequest; timer: ReturnType<typeof setTimeout>; resolve: (result: DesktopReplayResult) => void }>();
const pendingHeatmaps = new Map<number, { worker: Electron.UtilityProcess; request: DesktopHeatmapRequest; timer: ReturnType<typeof setTimeout>; resolve: (result: DesktopHeatmapResult) => void }>();
function stopAnalysisWorker() {
  const worker=activeWorker;activeWorker=null;activeReplay=null;activeHeatmap=null;activeSessionId=null;
  for(const [id,pending] of pendingChunks){clearTimeout(pending.timer);pending.resolve({kind:'error',message:'回放会话已结束。'});pendingChunks.delete(id);}
  for(const [id,pending] of pendingHeatmaps){clearTimeout(pending.timer);pending.resolve({kind:'error',message:'热力图会话已结束。'});pendingHeatmaps.delete(id);}
  // Graceful clear when possible; process termination also drops every retained domain reference.
  try { worker?.postMessage({kind:'session-release'}); } catch { /* Worker already exited. */ }
  if(worker){
    worker.removeAllListeners();
    // kill() can return false before Utility Process spawn. Retire that late process too.
    if(worker.pid===undefined)worker.once('spawn',()=>worker.kill());
    worker.kill();
  }
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
const releaseSession = (event: Electron.IpcMainInvokeEvent, sessionId: unknown) => {
  if(trustedWindow(event)&&typeof sessionId==='string'&&sessionId===activeSessionId){cancelActiveImport?.();stopAnalysisWorker();}
};
// Legacy release has always ended the analysis worker. Both APIs retain that ownership.
ipcMain.handle('replay:release', releaseSession);
ipcMain.handle('session:release', releaseSession);
ipcMain.handle('heatmap:grid', (event, value: unknown): Promise<DesktopHeatmapResult> | DesktopHeatmapResult => {
  const fail = (): DesktopHeatmapResult => ({kind:'error',message:'无效、不可用或已过期的热力图请求。'});
  const metadata=activeHeatmap,worker=activeWorker;
  if(!trustedWindow(event)||!metadata||!worker||!validateHeatmapRequest(value,metadata)||pendingHeatmaps.size>=HEATMAP_MAX_PENDING)return fail();
  // Detach caller-owned arrays before correlating an asynchronous result.
  const request:DesktopHeatmapRequest=JSON.parse(JSON.stringify(value));
  return new Promise(resolve=>{
    const id=++requestSequence,timer=setTimeout(()=>{pendingHeatmaps.delete(id);resolve({kind:'error',message:'热力图请求超时。'});},HEATMAP_TIMEOUT_MS);
    pendingHeatmaps.set(id,{worker,request,timer,resolve});
    try {worker.postMessage({kind:'heatmap-grid',requestId:id,request});}
    catch {clearTimeout(timer);pendingHeatmaps.delete(id);resolve(fail());}
  });
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
 * production app ignores environment path injection. Disk Files still use the private preload bridge.
 */
function injectedDemoPath(): string | undefined {
  if (__CS2_ANALYST_TEST_SEAM__) return process.env.CS2_ANALYST_TEST_DEM_PATH;
  if (!app.isPackaged) return process.env.CS2_ANALYST_DEM_PATH;
  return undefined;
}

function analyzeDemo(filePath: string, window: BrowserWindow): Promise<ImportResult> {
  stopAnalysisWorker();
  return new Promise(resolve => {
    const sessionId=randomUUID();
    const worker = utilityProcess.fork(fileURLToPath(new URL('./report-worker.js', import.meta.url)), [], { serviceName: 'CS2 DEM Analysis' });
    activeWorker = worker;
    activeSessionId = sessionId;
    let settled = false;
    const finish = (result: ImportResult, retain = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if(cancelActiveImport===cancel)cancelActiveImport=null;
      if(!retain&&activeWorker===worker)stopAnalysisWorker();
      resolve(result);
    };
    const cancel=()=>finish({kind:'cancelled'});
    cancelActiveImport=cancel;
    const timeout = setTimeout(() => finish({ kind: 'error', message: '分析超时（10 分钟）。请重新选择 DEM。' }), 10 * 60_000);
    worker.on('spawn', () => {
      if(activeWorker!==worker||settled){worker.kill();return;}
      worker.postMessage({ filePath, sessionId });
    });
    worker.on('message', (message) => {
      if(activeWorker!==worker)return;
      if(!message||typeof message!=='object')return;
      if(message.kind==='heatmap-grid'){
        const pending=pendingHeatmaps.get(message.requestId);if(!pending||pending.worker!==worker)return;
        clearTimeout(pending.timer);pendingHeatmaps.delete(message.requestId);
        // Every recognized reply ends its Promise, including malformed/error replies.
        let valid=false;
        try {valid=activeHeatmap!==null&&validateHeatmapResult(message.result,pending.request,activeHeatmap);}catch { /* Non-JSON/malformed worker reply. */ }
        pending.resolve(valid?message.result:{kind:'error',message:'热力图响应无效或超过大小限制。'});return;
      }
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
        const heatmap=message.report?.heatmap as DesktopHeatmapMetadata|undefined;
        const replayAvailable=metadata?.available===true&&metadata.sessionId===sessionId;
        const heatmapAvailable=heatmap?.available===true&&heatmap.sessionId===sessionId;
        activeReplay=replayAvailable?metadata!:null;
        activeHeatmap=heatmapAvailable?heatmap!:null;
        finish(message,replayAvailable||heatmapAvailable);
      } else if(message.kind==='error')finish(message);
    });
    worker.on('exit', () => { if(!settled)finish({ kind: 'error', message: '分析进程意外退出。请重新选择 DEM。' });else if(activeWorker===worker)stopAnalysisWorker(); });
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

/** Drag-and-drop import: same pipeline as the dialog, with an absolute .dem path resolved inside preload. */
ipcMain.handle('report:import-file', async (event, value: unknown): Promise<ImportResult> => {
  const window = trustedWindow(event);
  if (!window) return { kind: 'error', message: '无效的报告请求。' };
  if (typeof value !== 'string' || !value.trim() || !isAbsolute(value)) return { kind: 'error', message: '无效的 DEM 路径。' };
  if (importing) return { kind: 'error', message: '已有分析任务正在运行。' };
  importing = true;
  try {
    return await analyzeFromPath(value, window);
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
    cancelActiveImport?.();stopAnalysisWorker();
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

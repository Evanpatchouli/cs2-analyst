import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, ImportPhase } from '@cs2-coach/report-contract';

const api: DesktopApi = {
  version: '0.1.0',
  importDemo: () => ipcRenderer.invoke('report:import'),
  onProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, phase: ImportPhase) => listener(phase);
    ipcRenderer.on('report:progress', handler);
    return () => ipcRenderer.removeListener('report:progress', handler);
  },
};
contextBridge.exposeInMainWorld('cs2Coach', api);

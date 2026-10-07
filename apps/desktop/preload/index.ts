import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, ImportPhase } from '@cs2-analyst/report-contract';

const api: DesktopApi = {
  version: '0.1.0',
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: listener => {
      const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => listener(maximized);
      ipcRenderer.on('window:maximized-changed', handler);
      return () => ipcRenderer.removeListener('window:maximized-changed', handler);
    },
  },
  importDemo: () => ipcRenderer.invoke('report:import'),
  onProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, phase: ImportPhase) => listener(phase);
    ipcRenderer.on('report:progress', handler);
    return () => ipcRenderer.removeListener('report:progress', handler);
  },
};
contextBridge.exposeInMainWorld('cs2Analyst', api);

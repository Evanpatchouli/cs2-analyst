import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('cs2Coach', {
  version: '0.1.0',
});

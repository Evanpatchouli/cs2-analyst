import { app, BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: undefined,
    },
  });

  await mainWindow.loadURL('http://localhost:5173');
}

app.whenReady().then(createWindow);

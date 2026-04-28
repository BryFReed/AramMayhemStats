import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { initDb } from './db';
import { startLcuPolling, stopLcuPolling } from './lcu';
import { loadStaticData } from './dragon';
import { registerIpcHandlers } from './ipc-handlers';
import { startChampSelectCoordinator } from './champ-select';

let mainWindow: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#09090b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    // Force IPv4 — on Windows, `localhost` may resolve to ::1 first while Vite binds to 127.0.0.1.
    const devUrl = process.env['ELECTRON_RENDERER_URL'].replace('localhost', '127.0.0.1');
    let lastErr: unknown;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await mainWindow.loadURL(devUrl);
        return;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw lastErr;
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function emitToRenderer(event: string, payload: unknown) {
  mainWindow?.webContents.send(event, payload);
}

app.whenReady().then(async () => {
  initDb();
  loadStaticData().catch((err) => console.error('Static data load failed:', err));
  registerIpcHandlers();
  await createWindow();
  startLcuPolling(emitToRenderer);
  startChampSelectCoordinator(emitToRenderer);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopLcuPolling();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => stopLcuPolling());

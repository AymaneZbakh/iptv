/**
 * Electron Main Process
 * Hosts the Express/Vite backend + spawns MPV for native playback
 */

const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');

// Prevent multiple instances of the app
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const http = require('http');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const PORT = 3001; // Use 3001 in Electron to avoid conflict with dev server on 3000

let mainWindow = null;
let serverProcess = null;
let mpvProcess = null;
let tray = null;

// ─── MPV Binary Resolution ───────────────────────────────────────────────────

function getMpvPath() {
  if (isDev) {
    // In dev, expect mpv in PATH or local mpv-bin/
    const localBin = path.join(__dirname, '..', 'mpv-bin', 'mpv.exe');
    if (fs.existsSync(localBin)) return localBin;
    return 'mpv'; // Fall back to PATH
  }

  // In production (packaged), use bundled binary from extraResources
  const resourcesPath = process.resourcesPath;
  const bundledMpv = path.join(resourcesPath, 'mpv-bin', 'mpv.exe');
  if (fs.existsSync(bundledMpv)) return bundledMpv;

  // Last resort: try PATH
  return 'mpv';
}

// ─── Express Server Startup ───────────────────────────────────────────────────

function startExpressServer() {
  return new Promise((resolve, reject) => {
    const serverPath = isDev
      ? path.join(__dirname, '..', 'dist', 'server.cjs')
      : path.join(__dirname, '..', 'dist', 'server.cjs');

    if (!fs.existsSync(serverPath)) {
      console.warn('[Electron] Server bundle not found, skipping server start (dev mode uses tsx)');
      resolve();
      return;
    }

    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      ELECTRON_RUN_AS_NODE: '1',
    };

    serverProcess = spawn(process.execPath, [serverPath], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
      console.log('[Server]', data.toString().trim());
    });
    serverProcess.stderr.on('data', (data) => {
      console.error('[Server Error]', data.toString().trim());
    });

    // Poll until the server is ready
    const startTime = Date.now();
    const poll = setInterval(() => {
      http.get(`http://localhost:${PORT}/api/playlist?url=test`, (res) => {
        clearInterval(poll);
        resolve();
      }).on('error', () => {
        if (Date.now() - startTime > 15000) {
          clearInterval(poll);
          reject(new Error('Server did not start in time'));
        }
      });
    }, 300);
  });
}

// ─── Window Creation ──────────────────────────────────────────────────────────

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#09090b',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#09090b',
      symbolColor: '#facc15',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local stream URLs (CORS bypass at app level)
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    show: false,
  });

  // Remove default menu
  Menu.setApplicationMenu(null);

  const loadUrl = isDev
    ? 'http://localhost:3000' // Vite dev server
    : `http://localhost:${PORT}`;

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Try to load, retry if server not ready yet
  let retries = 0;
  const tryLoad = () => {
    mainWindow.loadURL(loadUrl).catch(() => {
      if (retries++ < 10) setTimeout(tryLoad, 500);
    });
  };
  tryLoad();
}

// ─── IPC: MPV Launch ──────────────────────────────────────────────────────────

ipcMain.handle('mpv:play', async (event, { url, channelName }) => {
  // Kill any existing MPV instance
  if (mpvProcess && !mpvProcess.killed) {
    mpvProcess.kill('SIGKILL');
    mpvProcess = null;
  }

  const mpvPath = getMpvPath();

  const args = [
    url,
    `--title=MPV IPTV - ${channelName || 'Stream'}`,
    '--cache=yes',
    '--cache-secs=10',
    '--demuxer-max-bytes=50MiB',
    '--demuxer-readahead-secs=5',
    '--stream-lavf-o=reconnect=1',
    '--stream-lavf-o=reconnect_streamed=1',
    '--stream-lavf-o=reconnect_delay_max=5',
    '--ytdl=no',
    '--no-input-default-bindings',
    '--input-ipc-server=\\\\.\\pipe\\mpvpipe',
    '--osc=yes',
    '--osd-level=1',
  ];

  return new Promise((resolve) => {
    try {
      mpvProcess = spawn(mpvPath, args, {
        detached: true,
        stdio: 'ignore',
      });

      mpvProcess.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      mpvProcess.on('spawn', () => {
        mpvProcess.unref(); // Allow Electron to exit without waiting for MPV
        resolve({ success: true, pid: mpvProcess.pid });
      });

    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

ipcMain.handle('mpv:stop', async () => {
  if (mpvProcess && !mpvProcess.killed) {
    mpvProcess.kill('SIGKILL');
    mpvProcess = null;
  }
  return { success: true };
});

ipcMain.handle('mpv:check', async () => {
  const mpvPath = getMpvPath();
  return new Promise((resolve) => {
    execFile(mpvPath, ['--version'], { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve({ available: false, error: err.message });
      } else {
        const version = stdout.split('\n')[0] || 'mpv (unknown version)';
        resolve({ available: true, version });
      }
    });
  });
});

ipcMain.handle('shell:openExternal', async (event, url) => {
  await shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('dialog:showMpvMissing', async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'MPV Not Found',
    message: 'MPV player binary was not found on this system.',
    detail: 'To use native MPV playback:\n\n1. Download MPV from https://mpv.io/installation/\n2. Place mpv.exe in a folder on your PATH\n   OR put it in the "mpv-bin" folder next to this app.\n\nYou can still use the built-in web player in the meantime.',
    buttons: ['Download MPV', 'Use Web Player'],
    defaultId: 0,
  });
  if (result.response === 0) {
    shell.openExternal('https://mpv.io/installation/');
  }
  return result.response;
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────

let isCreatingWindow = false;

app.whenReady().then(async () => {
  if (!isDev) {
    try {
      await startExpressServer();
    } catch (err) {
      console.error('[Electron] Failed to start server:', err.message);
    }
  }

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && !isCreatingWindow) {
      isCreatingWindow = true;
      createWindow().finally(() => { isCreatingWindow = false; });
    }
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (serverProcess) serverProcess.kill();
    if (mpvProcess && !mpvProcess.killed) mpvProcess.kill('SIGKILL');
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
  if (mpvProcess && !mpvProcess.killed) mpvProcess.kill('SIGKILL');
});

const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');

const isDev = process.env.NODE_ENV !== 'production';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'AURORA',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For now, allow direct access if needed
      webSecurity: false // Allow local files and cross-origin audio
    }
  });

  if (isDev) {
    // In dev, load the Next.js dev server
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the static export via custom protocol
    mainWindow.loadURL('app://./index.html');
  }
}

app.whenReady().then(() => {
  // Register custom protocol to handle Next.js absolute paths
  protocol.registerFileProtocol('app', (request, callback) => {
    const urlStr = request.url.substr(6);
    // Determine the target path inside the 'out' directory
    let targetPath = path.normalize(`${__dirname}/out/${urlStr}`);
    
    // Fallback for clean URLs (e.g. /search -> /search.html)
    if (!fs.existsSync(targetPath) && fs.existsSync(targetPath + '.html')) {
      targetPath += '.html';
    }
    
    callback({ path: targetPath });
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

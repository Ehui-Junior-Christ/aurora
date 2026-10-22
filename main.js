const { app, BrowserWindow, protocol, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');

// SECURITY: a packaged build must never be treated as "dev" (NODE_ENV is
// usually unset in a packaged app, which previously made it load
// http://localhost:3000 and open DevTools).
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

const DEV_URL = 'http://localhost:3000';
const APP_ORIGIN = 'app://aurora';
const OUT_DIR = path.join(__dirname, 'out');
// Public web origin of AURORA. Used as Referer for YouTube embeds from app://
// (must match the `origin` player var set in src/lib/audio-engine.ts).
const EMBED_ORIGIN = 'https://aurora-theta-rust.vercel.app';

// Hosts that may be opened in the system browser (https only).
const EXTERNAL_ALLOWLIST = new Set([
  'github.com',
  'www.youtube.com',
  'youtube.com',
  'youtu.be',
  'lrclib.net',
]);

// Content-Security-Policy for the packaged app (served through app://).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "child-src 'self' blob: https://www.youtube.com https://www.youtube-nocookie.com",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function isInternalUrl(target) {
  if (isDev) return target.startsWith(DEV_URL + '/') || target === DEV_URL;
  return target.startsWith(APP_ORIGIN + '/');
}

function openExternalSafely(target) {
  try {
    const parsed = new URL(target);
    if (parsed.protocol === 'https:' && EXTERNAL_ALLOWLIST.has(parsed.hostname)) {
      shell.openExternal(parsed.toString());
    }
  } catch {
    // ignore malformed URLs
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'AURORA',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: isDev,
      spellcheck: false,
    },
  });

  // Block window.open / target=_blank: open allow-listed https links externally.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });

  // Block top-level navigation away from the app.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      openExternalSafely(url);
    }
  });
  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isInternalUrl(url)) event.preventDefault();
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  }
}

// Make app:// a standard, secure origin (needed for IndexedDB, fonts, CSP 'self',
// fetch and workers). Must run before the app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

// Never allow <webview> to be attached.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

app.whenReady().then(() => {
  // Deny every permission request except the ones a music player needs.
  const allowedPermissions = new Set(['media', 'fullscreen', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });

  // YouTube embeds refuse to play (errors 152/153) without a valid http(s)
  // Referer, and app:// is not one. Give YouTube requests the app's public
  // web origin as Referer only when the original is missing or is app://.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        'https://www.youtube.com/*',
        'https://www.youtube-nocookie.com/*',
        'https://*.ytimg.com/*',
        'https://*.googlevideo.com/*',
      ],
    },
    (details, callback) => {
      const headers = details.requestHeaders;
      const referer = headers.Referer || headers.referer || '';
      if (!referer || referer.startsWith('app://')) {
        delete headers.referer;
        headers.Referer = EMBED_ORIGIN + '/';
      }
      callback({ requestHeaders: headers });
    }
  );

  // Register custom protocol to handle Next.js absolute paths
  protocol.registerFileProtocol('app', (request, callback) => {
    let urlStr;
    try {
      const parsed = new URL(request.url);
      if (parsed.host !== 'aurora') {
        callback({ statusCode: 404 });
        return;
      }
      // Drop query string / hash and decode percent-escapes.
      urlStr = decodeURIComponent(parsed.pathname);
    } catch {
      callback({ statusCode: 400 });
      return;
    }

    // SECURITY: resolve inside out/ and refuse anything that escapes it
    // (path traversal such as app://./../../secret).
    let targetPath = path.resolve(OUT_DIR, '.' + path.sep + urlStr);
    const rel = path.relative(OUT_DIR, targetPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      callback({ statusCode: 403 });
      return;
    }

    // Fallback for clean URLs (e.g. /search -> /search.html)
    if (!fs.existsSync(targetPath) && fs.existsSync(targetPath + '.html')) {
      targetPath += '.html';
    } else if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
      targetPath = path.join(targetPath, 'index.html');
    }

    const headers = { 'X-Content-Type-Options': 'nosniff' };
    if (targetPath.endsWith('.html')) headers['Content-Security-Policy'] = CSP;
    callback({ path: targetPath, headers });
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

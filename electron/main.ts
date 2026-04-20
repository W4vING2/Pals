import { app, BrowserWindow, Menu, shell, ipcMain, nativeImage, Notification, Tray } from "electron";
import path from "path";

// ── Config ───────────────────────────────────────────────────
const PROD_URL = "https://pals-rho.vercel.app";
const DEV_URL = "http://localhost:3000";
const isDev = process.env.NODE_ENV === "development" || process.argv.includes("--dev");
const PROTOCOL = "pals";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function getAppBaseUrl() {
  return isDev ? DEV_URL : PROD_URL;
}

function sanitizeInAppPath(rawPath?: string): string {
  if (typeof rawPath !== "string") return "/";
  if (!rawPath.startsWith("/") || rawPath.startsWith("//")) return "/";
  return rawPath;
}

function canOpenExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

// ── Custom Protocol for OAuth ────────────────────────────────

// Register as default handler for pals:// links
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Prevent multiple instances — focus existing window on second launch
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    // On Windows/Linux the URL is in argv
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (url) handleProtocolUrl(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

/** Handle pals:// deep links (OAuth callback) */
function handleProtocolUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    // pals://auth/callback?code=xxx
    const isAuthCallback =
      url.pathname?.includes("/auth/callback") ||
      url.host === "auth";

    if (!isAuthCallback || !mainWindow) return;

    const code = url.searchParams.get("code");
    const appBaseUrl = getAppBaseUrl();

    if (code) {
      mainWindow.loadURL(`${appBaseUrl}/auth/callback?code=${encodeURIComponent(code)}`);
    } else {
      // Implicit flow fallback
      const params = url.search || url.hash;
      if (params) {
        mainWindow.loadURL(`${appBaseUrl}/auth/callback${params}`);
      }
    }

    mainWindow.focus();
  } catch {
    // Invalid URL
  }
}

// macOS: handle protocol URL via open-url event
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

// ── Window ───────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 480,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#09090b",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  // Smooth show after content loads
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Load app
  const url = getAppBaseUrl();
  mainWindow.loadURL(url);

  // Open external links in system browser (NOT Google OAuth in-app)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (canOpenExternalUrl(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Handle navigation to external URLs — let Google OAuth through system browser
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const appUrl = getAppBaseUrl();
    // Allow navigation within the app
    if (url.startsWith(appUrl) || url.startsWith("http://localhost")) return;
    // Allow Supabase auth URLs to load within the window
    if (url.includes("supabase.co/auth") || url.includes("accounts.google.com")) return;
    // Everything else opens externally
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

// ── macOS Menu ───────────────────────────────────────────────

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about", label: "О Pals" },
        { type: "separator" },
        {
          label: "Настройки",
          accelerator: "Cmd+,",
          click: () => mainWindow?.webContents.executeJavaScript("window.location.href='/settings'"),
        },
        { type: "separator" },
        { role: "services", label: "Службы" },
        { type: "separator" },
        { role: "hide", label: "Скрыть Pals" },
        { role: "hideOthers", label: "Скрыть остальные" },
        { role: "unhide", label: "Показать все" },
        { type: "separator" },
        { role: "quit", label: "Завершить Pals" },
      ],
    },
    {
      label: "Правка",
      submenu: [
        { role: "undo", label: "Отменить" },
        { role: "redo", label: "Повторить" },
        { type: "separator" },
        { role: "cut", label: "Вырезать" },
        { role: "copy", label: "Копировать" },
        { role: "paste", label: "Вставить" },
        { role: "selectAll", label: "Выбрать все" },
      ],
    },
    {
      label: "Вид",
      submenu: [
        { role: "reload", label: "Обновить" },
        { role: "forceReload", label: "Принудительно обновить" },
        { type: "separator" },
        { role: "resetZoom", label: "Стандартный масштаб" },
        { role: "zoomIn", label: "Увеличить" },
        { role: "zoomOut", label: "Уменьшить" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Полный экран" },
      ],
    },
    {
      label: "Переход",
      submenu: [
        {
          label: "Главная",
          accelerator: "Cmd+1",
          click: () => mainWindow?.webContents.executeJavaScript("window.location.href='/'"),
        },
        {
          label: "Сообщения",
          accelerator: "Cmd+2",
          click: () => mainWindow?.webContents.executeJavaScript("window.location.href='/messages'"),
        },
        {
          label: "Поиск",
          accelerator: "Cmd+3",
          click: () => mainWindow?.webContents.executeJavaScript("window.location.href='/search'"),
        },
        {
          label: "Уведомления",
          accelerator: "Cmd+4",
          click: () => mainWindow?.webContents.executeJavaScript("window.location.href='/notifications'"),
        },
        {
          label: "Профиль",
          accelerator: "Cmd+5",
          click: () => mainWindow?.webContents.executeJavaScript(
            "window.location.href='/profile/' + (document.querySelector('[data-username]')?.dataset?.username || '')"
          ),
        },
      ],
    },
    {
      label: "Окно",
      submenu: [
        { role: "minimize", label: "Свернуть" },
        { role: "zoom", label: "Увеличить" },
        { type: "separator" },
        { role: "front", label: "Все на передний план" },
        { role: "close", label: "Закрыть" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Tray ─────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, "..", "public", "icon-192.png");
  try {
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
    tray = new Tray(icon);
    tray.setToolTip("Pals");
    tray.on("click", () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  } catch {
    // Icon not found, skip tray
  }
}

// ── IPC Handlers ─────────────────────────────────────────────

function setupIPC() {
  // Set dock badge (unread count)
  ipcMain.on("set-badge", (_event, count: number) => {
    if (process.platform === "darwin" && app.dock) {
      app.dock.setBadge(count > 0 ? String(count) : "");
    }
  });

  // Show native notification
  ipcMain.on("show-notification", (_event, data: { title: string; body: string; url?: string }) => {
    const notification = new Notification({
      title: data.title,
      body: data.body,
      icon: path.join(__dirname, "..", "public", "icon-192.png"),
      silent: false,
    });

    notification.on("click", () => {
      if (mainWindow) {
        mainWindow.focus();
        if (data.url) {
          mainWindow.loadURL(`${getAppBaseUrl()}${sanitizeInAppPath(data.url)}`);
        }
      }
    });

    notification.show();
  });

  // Focus window
  ipcMain.on("focus-window", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Open URL in system browser (for OAuth)
  ipcMain.on("open-external", (_event, url: string) => {
    if (canOpenExternalUrl(url)) {
      shell.openExternal(url);
    }
  });
}

// ── App Lifecycle ────────────────────────────────────────────

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  createTray();
  setupIPC();
});

// macOS: re-create window when dock icon is clicked
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    mainWindow?.focus();
  }
});

// Keep app running in dock when all windows closed (macOS behavior)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

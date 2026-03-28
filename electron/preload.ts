import { contextBridge, ipcRenderer } from "electron";

// Expose a safe API to the renderer (web app)
contextBridge.exposeInMainWorld("palsDesktop", {
  // Platform info
  platform: "macos" as const,
  isDesktop: true,

  // Dock badge (unread count)
  setBadge: (count: number) => {
    ipcRenderer.send("set-badge", count);
  },

  // Native notification
  showNotification: (data: { title: string; body: string; url?: string }) => {
    ipcRenderer.send("show-notification", data);
  },

  // Focus main window
  focusWindow: () => {
    ipcRenderer.send("focus-window");
  },

  // Open URL in system browser (for OAuth)
  openExternal: (url: string) => {
    ipcRenderer.send("open-external", url);
  },
});

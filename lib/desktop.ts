"use client";

// Type-safe interface for the Electron preload bridge
interface PalsDesktopAPI {
  platform: "macos";
  isDesktop: true;
  setBadge: (count: number) => void;
  showNotification: (data: { title: string; body: string; url?: string }) => void;
  focusWindow: () => void;
  openExternal: (url: string) => void;
}

declare global {
  interface Window {
    palsDesktop?: PalsDesktopAPI;
  }
}

/** Check if running inside the Electron desktop app */
export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && !!window.palsDesktop?.isDesktop;
}

/** Set the dock badge count (macOS) */
export function setDockBadge(count: number): void {
  window.palsDesktop?.setBadge(count);
}

/** Show a native macOS notification */
export function showDesktopNotification(title: string, body: string, url?: string): void {
  window.palsDesktop?.showNotification({ title, body, url });
}

/** Focus the desktop window */
export function focusDesktopWindow(): void {
  window.palsDesktop?.focusWindow();
}

"use client";

import React, { useEffect } from "react";
import { useThemeStore } from "@/lib/store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useThemeStore();

  useEffect(() => {
    // Read theme from localStorage on mount
    const stored = localStorage.getItem("pals-theme") as "dark" | "light" | null;
    const initial = stored ?? "dark";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, [setTheme]);

  // Keep data-theme in sync whenever theme changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return <>{children}</>;
}

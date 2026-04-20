"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { motion } from "framer-motion";
import { type ThemeName, themeConfig } from "@/lib/vibe";

type ThemeContextValue = {
  activeTheme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const STORAGE_KEY = "lume-global-theme-v1";
const DEFAULT_THEME: ThemeName = "Midnight";
const THEME_EVENT = "lume-theme-change";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemeName {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }
  try {
    const savedTheme = window.localStorage.getItem(STORAGE_KEY);
    if (savedTheme && savedTheme in themeConfig) {
      return savedTheme as ThemeName;
    }
  } catch {
    // Ignore persistence read failures and keep default theme.
  }
  return DEFAULT_THEME;
}

function subscribeToThemeStore(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handle = () => callback();
  window.addEventListener("storage", handle);
  window.addEventListener(THEME_EVENT, handle);
  return () => {
    window.removeEventListener("storage", handle);
    window.removeEventListener(THEME_EVENT, handle);
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const activeTheme = useSyncExternalStore(subscribeToThemeStore, readStoredTheme, () => DEFAULT_THEME);
  const theme = themeConfig[activeTheme];

  const setTheme = useCallback((nextTheme: ThemeName) => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // Ignore persistence write failures.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--bg-color", theme.background);
    root.style.setProperty("--text-color", theme.foreground);
    root.style.setProperty("--font-family", theme.fontFamily);
  }, [theme.background, theme.foreground, theme.fontFamily]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      activeTheme,
      setTheme,
    }),
    [activeTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <motion.div
        className="min-h-screen transition-[color,background-color] duration-[1350ms] ease-in-out"
        initial={false}
        animate={{ backgroundColor: theme.background, color: theme.foreground }}
        transition={{ duration: 1.35, ease: [0.4, 0, 0.2, 1] }}
      >
        {children}
      </motion.div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}

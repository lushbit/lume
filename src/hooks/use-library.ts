"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { type ThemeName } from "@/lib/vibe";

export type LibraryItem = {
  title: string;
  url: string;
  vibe: ThemeName;
  savedAt: string;
};

const STORAGE_KEY = "lume-library-v1";
const LIBRARY_EVENT = "lume-library-change";
const EMPTY_ITEMS: LibraryItem[] = [];
let cachedRaw = "";
let cachedItems: LibraryItem[] = EMPTY_ITEMS;

function readLibrarySnapshot(): LibraryItem[] {
  if (typeof window === "undefined") {
    return EMPTY_ITEMS;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedRaw = "";
      cachedItems = EMPTY_ITEMS;
      return EMPTY_ITEMS;
    }

    if (raw === cachedRaw) {
      return cachedItems;
    }

    const parsed = JSON.parse(raw) as LibraryItem[];
    if (Array.isArray(parsed)) {
      cachedRaw = raw;
      cachedItems = parsed;
      return cachedItems;
    }
    cachedRaw = "";
    cachedItems = EMPTY_ITEMS;
    return EMPTY_ITEMS;
  } catch {
    cachedRaw = "";
    cachedItems = EMPTY_ITEMS;
    return EMPTY_ITEMS;
  }
}

function writeLibrarySnapshot(items: LibraryItem[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const nextRaw = JSON.stringify(items);
    window.localStorage.setItem(STORAGE_KEY, nextRaw);
    cachedRaw = nextRaw;
    cachedItems = items;
  } catch {
    // Ignore write failures to keep UI responsive.
  }
  window.dispatchEvent(new Event(LIBRARY_EVENT));
}

function subscribeToLibraryStore(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handle = () => callback();
  window.addEventListener("storage", handle);
  window.addEventListener(LIBRARY_EVENT, handle);
  return () => {
    window.removeEventListener("storage", handle);
    window.removeEventListener(LIBRARY_EVENT, handle);
  };
}

export function useLibrary() {
  const items = useSyncExternalStore(subscribeToLibraryStore, readLibrarySnapshot, () => EMPTY_ITEMS);

  const saveItem = useCallback((entry: Omit<LibraryItem, "savedAt">) => {
    const current = readLibrarySnapshot();
    const withoutExisting = current.filter((item) => item.url !== entry.url);
    writeLibrarySnapshot([{ ...entry, savedAt: new Date().toISOString() }, ...withoutExisting]);
  }, []);

  const removeItem = useCallback((url: string) => {
    const current = readLibrarySnapshot();
    writeLibrarySnapshot(current.filter((item) => item.url !== url));
  }, []);

  const updateItemTheme = useCallback((url: string, vibe: ThemeName) => {
    const current = readLibrarySnapshot();
    let changed = false;
    const next = current.map((item) => {
      if (item.url !== url || item.vibe === vibe) {
        return item;
      }
      changed = true;
      return { ...item, vibe };
    });
    if (changed) {
      writeLibrarySnapshot(next);
    }
  }, []);

  const getItem = useCallback((url: string) => {
    return items.find((item) => item.url === url);
  }, [items]);

  const clear = useCallback(() => {
    writeLibrarySnapshot([]);
  }, []);

  const isSaved = useCallback(
    (url: string) => {
      return items.some((item) => item.url === url);
    },
    [items],
  );

  return useMemo(
    () => ({
      items,
      saveItem,
      removeItem,
      updateItemTheme,
      getItem,
      clear,
      isSaved,
    }),
    [items, saveItem, removeItem, updateItemTheme, getItem, clear, isSaved],
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface ShortcutConfig {
  key: string;
  ctrlOrCmd?: boolean;
  shift?: boolean;
  alt?: boolean;
  callback: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      for (const shortcut of shortcuts) {
        const ctrlOrCmdMatch = shortcut.ctrlOrCmd
          ? event.ctrlKey || event.metaKey
          : !event.ctrlKey && !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        if (
          event.key &&
          event.key.toLowerCase() === shortcut.key.toLowerCase() &&
          ctrlOrCmdMatch &&
          shiftMatch &&
          altMatch
        ) {
          event.preventDefault();
          shortcut.callback();
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts]);
}

// Global shortcuts hook for navbar
export function useGlobalShortcuts() {
  const router = useRouter();

  useKeyboardShortcuts([
    {
      key: ",",
      ctrlOrCmd: true,
      callback: () => router.push("/settings"),
      description: "Open Settings",
    },
    {
      key: "h",
      ctrlOrCmd: true,
      callback: () => router.push("/"),
      description: "Go Home",
    },
    {
      key: "d",
      ctrlOrCmd: true,
      callback: () => router.push("/dashboard"),
      description: "Go to Dashboard",
    },
  ]);
}

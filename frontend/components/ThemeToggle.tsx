"use client";

import React, { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

const THEME_KEY = "orbito-theme";

function readTheme(): ThemeMode {
  if (typeof document === "undefined") return "light";
  const current = document.documentElement.dataset.theme;
  return current === "dark" ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage failures in private browsing.
  }
}

export function ThemeToggle({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={[
        "theme-toggle inline-flex items-center rounded-full border transition active:scale-[0.98]",
        compact ? "h-9 px-2.5" : "h-10 gap-2 px-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
      title={`Switch to ${dark ? "light" : "dark"} mode`}
    >
      <span className="theme-toggle-orb" aria-hidden="true">
        {dark ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
            <path d="M12 3v2.4M12 18.6V21M4.64 4.64l1.7 1.7M17.66 17.66l1.7 1.7M3 12h2.4M18.6 12H21M4.64 19.36l1.7-1.7M17.66 6.34l1.7-1.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
            <path d="M20.2 14.2A7.2 7.2 0 0 1 9.8 3.8 8.7 8.7 0 1 0 20.2 14.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {!compact ? <span className="text-[12px] font-semibold">{dark ? "Dark" : "Light"}</span> : null}
    </button>
  );
}

"use client";

import { useState } from "react";
import { useSyncExternalStore, type KeyboardEvent } from "react";

const THEME_STORAGE_KEY = "calm-daily-coach:theme";

type ThemeMode = "dark" | "light";

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  window.dispatchEvent(new Event("themechange"));
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("themechange", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("themechange", callback);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getStoredTheme, () => "dark");
  const [pendingLightMode, setPendingLightMode] = useState(false);

  function handleClick() {
    if (theme === "dark" && !pendingLightMode) {
      setPendingLightMode(true);
      return;
    }

    const nextTheme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    setPendingLightMode(false);
  }

  function cancelLightMode() {
    setPendingLightMode(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && pendingLightMode) {
      event.preventDefault();
      setPendingLightMode(false);
    }
  }

  return (
    <div className="theme-toggle-shell" onKeyDown={handleKeyDown}>
      {/*
        v0.26 D3: no visible text. The button is a 30x30 circle sized by the
        shared `.keyboard-help-trigger, .theme-toggle` rule in globals.css, and
        its meaning is carried by the `◐`/`◑` glyph `.theme-toggle::before`
        already rendered (globals.css:315-322) plus the `aria-label` below,
        which is unchanged. `.secondary-button` is deliberately gone: its
        `padding: 10px 16px` around a full label is what made this control
        46.0 px tall and therefore made it the tallest thing in the app's
        chrome (HEADER_ACTIONS.md 1b).
      */}
      <button
        className="theme-toggle"
        type="button"
        onClick={handleClick}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-pressed={theme === "dark"}
        aria-expanded={theme === "dark" ? pendingLightMode : undefined}
        data-theme={theme}
      />

      {theme === "dark" && pendingLightMode ? (
        <div className="theme-toggle-confirmation" role="status" aria-live="polite">
          {/*
            The word "Confirm light mode" MOVED here from the button's own
            text, which a label-less button cannot carry (D3). It is the
            panel's heading rather than a replacement for the sentence below,
            so every existing assertion in theme-toggle.test.tsx still holds
            byte-for-byte: the confirmation flow did not change, only where its
            name is written.
          */}
          <p className="theme-toggle-confirmation-title">Confirm light mode</p>
          <p>Dark mode is the default because it is easier to read. Switch to light mode anyway?</p>
          <div className="theme-toggle-actions">
            <button className="secondary-button" type="button" onClick={cancelLightMode}>
              Keep dark mode
            </button>
            <button className="primary-button" type="button" onClick={handleClick}>
              Use light mode
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
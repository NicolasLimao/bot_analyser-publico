import { useState } from 'react';

type Theme = 'light' | 'dark';
const themeKey = 'bot-analyser:theme';

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      'content',
      getComputedStyle(document.documentElement)
        .getPropertyValue('--canvas')
        .trim(),
    );
}

export function initializeTheme() {
  let theme: Theme = window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
  try {
    const stored = localStorage.getItem(themeKey);
    if (stored === 'dark' || stored === 'light') theme = stored;
  } catch {
    // The system preference works even when storage is unavailable.
  }
  applyTheme(theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme ?? 'light',
  );
  const dark = theme === 'dark';
  const label = dark ? 'Ativar tema claro' : 'Ativar tema escuro';
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => {
        const next = dark ? 'light' : 'dark';
        setTheme(next);
        applyTheme(next);
        try {
          localStorage.setItem(themeKey, next);
        } catch {
          // Keep the chosen theme for this session.
        }
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
          </>
        ) : (
          <path d="M20.8 13.2A9 9 0 0 1 10.8 3.2a9 9 0 1 0 10 10Z" />
        )}
      </svg>
      <span>{dark ? 'Tema claro' : 'Tema escuro'}</span>
    </button>
  );
}

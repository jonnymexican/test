import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'get-inspired:theme';
const THEMES = ['dark', 'light'];

function loadTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (THEMES.includes(stored)) return stored;
  } catch {
    // Storage unavailable — fall back to the default.
  }
  return 'dark';
}

export default function useTheme() {
  const [theme, setTheme] = useState(loadTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage unavailable — theme just won't persist.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}

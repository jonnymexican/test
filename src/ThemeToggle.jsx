import * as React from 'react';

const THEME_LABELS = { dark: '☀️', light: '🌙' };

export default function ThemeToggle({ theme, onToggle }) {
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={`Switch to ${next} mode`}
      aria-pressed={theme === 'light'}
      title={`Switch to ${next} mode`}
    >
      <span aria-hidden="true">{THEME_LABELS[theme] ?? '☀️'}</span>
    </button>
  );
}

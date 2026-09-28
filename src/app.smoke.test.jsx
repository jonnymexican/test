// Full-app smoke test: renders the real App and clicks through the core
// flows the way a user would. A failure here blocks the Pages deploy.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import App from './App.jsx';

const readFavs = () => {
  try {
    return JSON.parse(window.localStorage.getItem('get-inspired:favorites') || '[]');
  } catch {
    return [];
  }
};

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(window, 'open').mockImplementation(() => null);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Get Inspired smoke: core flows', () => {
  it('shows a quote of the day and the favorites section', () => {
    render(<App />);
    expect(screen.getByText(/quote of the day/i)).toBeTruthy();
    expect(screen.getByRole('region', { name: /favorite quotes/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /inspire me again/i })).toBeTruthy();
  });

  it('favorites the current quote and it lands in storage', () => {
    render(<App />);
    const favBtn = screen.getByRole('button', { name: /add quote to favorites/i });
    fireEvent.click(favBtn);
    expect(readFavs().length).toBe(1);
  });

  it('removes a favorite via the ✕ button (regression: silent no-op)', () => {
    window.localStorage.setItem(
      'get-inspired:favorites',
      JSON.stringify(['Stay hungry, stay foolish. — Steve Jobs'])
    );
    render(<App />);
    expect(screen.getByText(/stay hungry, stay foolish/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /remove quote: stay hungry/i }));

    expect(readFavs()).toHaveLength(0);
    // And the empty-state copy returns.
    expect(screen.getByText(/tap the ♥ on a quote/i)).toBeTruthy();
  });

  it('adds a custom quote and shows it in My quotes', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /\+ add your own quote/i }));
    fireEvent.change(screen.getByLabelText('Your quote'), {
      target: { value: 'Test-drive the day. — Buffy' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save quote/i }));

    await waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem('get-inspired:custom-quotes') || '[]')
          .map((q) => q.text)
      ).toContain('Test-drive the day. — Buffy')
    );
    // The custom category becomes active and displays the new quote.
    expect(screen.getByText(/test-drive the day/i)).toBeTruthy();
  });

  it('toggles the theme and persists it', () => {
    render(<App />);
    const before = window.localStorage.getItem('get-inspired:theme');
    fireEvent.click(screen.getByRole('button', { name: /switch to light mode|switch to dark mode/i }));
    expect(window.localStorage.getItem('get-inspired:theme')).not.toBe(before);
  });
});

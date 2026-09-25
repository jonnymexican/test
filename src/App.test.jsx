import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import App from './App';

const heartButton = () => screen.getByRole('button', { name: /add quote to favorites/i });
const quoteText = () => screen.getByRole('heading', { level: 3 }).textContent;
const favoritesSection = () => screen.getByRole('region', { name: /favorite quotes/i });

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders the app title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/get inspired/i);
  });

  it('shows an inspirational quote', () => {
    render(<App />);
    expect(screen.getByText(/your inspirational quote is:/i)).toBeInTheDocument();
  });

  it('shows a new quote when the button is clicked', () => {
    render(<App />);
    const firstQuote = quoteText();

    fireEvent.click(screen.getByRole('button', { name: /inspire me again/i }));

    expect(quoteText()).not.toBe(firstQuote);
  });

  it('renders the copyright', () => {
    render(<App />);
    expect(screen.getByText(/©️ 2004/i)).toBeInTheDocument();
  });

  it('saves a quote to favorites via the heart button', () => {
    render(<App />);
    const quote = quoteText();

    fireEvent.click(heartButton());

    expect(screen.getByRole('button', { name: /remove quote from favorites/i })).toBeInTheDocument();
    expect(within(favoritesSection()).getByText(quote)).toBeInTheDocument();
  });

  it('toggles the same quote out of favorites', () => {
    render(<App />);
    const quote = quoteText();

    fireEvent.click(heartButton());
    fireEvent.click(screen.getByRole('button', { name: /remove quote from favorites/i }));

    expect(within(favoritesSection()).queryByText(quote)).not.toBeInTheDocument();
    expect(screen.getByText(/tap the ♥ on a quote to save it here/i)).toBeInTheDocument();
  });

  it('removes a quote from the favorites list with its ✕ button', () => {
    render(<App />);
    const quote = quoteText();

    fireEvent.click(heartButton());
    fireEvent.click(
      within(favoritesSection()).getByRole('button', { name: new RegExp(`remove quote: ${quote}`, 'i') })
    );

    expect(within(favoritesSection()).queryByText(quote)).not.toBeInTheDocument();
  });

  it('persists favorites to localStorage and restores them on remount', () => {
    const { unmount } = render(<App />);
    const quote = quoteText();

    fireEvent.click(heartButton());
    expect(JSON.parse(window.localStorage.getItem('get-inspired:favorites'))).toContain(quote);

    unmount();
    render(<App />);

    expect(within(favoritesSection()).getByText(quote)).toBeInTheDocument();
  });

  it('clears all favorites with the Clear all button', () => {
    render(<App />);

    fireEvent.click(heartButton());
    expect(within(favoritesSection()).getAllByRole('listitem').length).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /clear all favorite quotes/i }));

    expect(within(favoritesSection()).queryAllByRole('listitem').length).toBe(0);
    expect(JSON.parse(window.localStorage.getItem('get-inspired:favorites'))).toEqual([]);
    expect(screen.getByText(/tap the ♥ on a quote to save it here/i)).toBeInTheDocument();
  });

  it('hides the Clear all button when there are no favorites', () => {
    render(<App />);

    expect(screen.queryByRole('button', { name: /clear all favorite quotes/i })).not.toBeInTheDocument();
  });

  it('opens an email draft containing the quote and shows a confirmation', () => {
    const location = window.location;
    delete window.location;
    window.location = { href: '' };
    vi.useFakeTimers();

    try {
      render(<App />);
      const quote = quoteText();
      const shareButton = () => screen.getByRole('button', { name: /share quote by email/i });

      act(() => {
        fireEvent.click(shareButton());
      });

      expect(window.location.href).toMatch(/^mailto:/);
      const url = new URL(window.location.href.replace(/^mailto:/, 'http://dummy'));
      expect(url.searchParams.get('subject')).toMatch(/inspirational quote/i);
      expect(decodeURIComponent(url.searchParams.get('body'))).toContain(quote);
      expect(screen.getByRole('button', { name: /opening email draft/i })).toHaveTextContent('✓ Draft ready!');

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(shareButton()).toBeInTheDocument();
    } finally {
      window.location = location;
      vi.useRealTimers();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    delete navigator.clipboard;
  });
});

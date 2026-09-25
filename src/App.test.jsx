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
    expect(screen.getByText(/©️ 2016/i)).toBeInTheDocument();
  });

  it('filters quotes by collection with the chips', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Carl Jung' }));

    expect(screen.getByRole('heading', { level: 3 }).textContent).toMatch(/— Carl Jung$/);
    expect(screen.getByRole('button', { name: 'Carl Jung' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('adds a custom quote, shows it, and persists it across remount', () => {
    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /\+ add your own quote/i }));
    fireEvent.change(screen.getByLabelText(/your quote/i), {
      target: { value: 'Test quote from me — Me' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save quote/i }));

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Test quote from me — Me');
    expect(JSON.parse(window.localStorage.getItem('get-inspired:custom-quotes'))).toEqual([
      { text: 'Test quote from me — Me', category: 'custom' },
    ]);

    unmount();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'My quotes' }));

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Test quote from me — Me');
  });

  it('rejects an empty custom quote with a message', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /\+ add your own quote/i }));
    fireEvent.click(screen.getByRole('button', { name: /save quote/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/write a quote first/i);
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

  it('opens an email draft from the share menu', () => {
    const location = window.location;
    delete window.location;
    window.location = { href: '' };

    try {
      render(<App />);
      const quote = quoteText();

      fireEvent.click(screen.getByRole('button', { name: /share quote/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /email draft/i }));

      expect(window.location.href).toMatch(/^mailto:/);
      const url = new URL(window.location.href.replace(/^mailto:/, 'http://dummy'));
      expect(url.searchParams.get('subject')).toMatch(/inspirational quote/i);
      expect(decodeURIComponent(url.searchParams.get('body'))).toContain(quote);
    } finally {
      window.location = location;
    }
  });

  it('copies the quote to the clipboard from the share menu', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    try {
      render(<App />);
      const quote = quoteText();

      fireEvent.click(screen.getByRole('button', { name: /share quote/i }));
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name: /copy to clipboard/i }));
      });

      expect(writeText).toHaveBeenCalledWith(quote);
    } finally {
      delete navigator.clipboard;
    }
  });

  it('opens an X post intent from the share menu', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    try {
      render(<App />);

      fireEvent.click(screen.getByRole('button', { name: /share quote/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /post on x/i }));

      expect(openSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/twitter\.com\/intent\/tweet\?text=/),
        '_blank',
        expect.any(String)
      );
    } finally {
      openSpy.mockRestore();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    delete navigator.clipboard;
  });
});

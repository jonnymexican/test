import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import App from './App';
import quotes from './quotes';
import { todaysQuoteOfDay } from './dailyQuote';

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

  it('shows the quote of the day above the main quote', () => {
    render(<App />);

    expect(screen.getByRole('region', { name: /quote of the day/i })).toBeInTheDocument();
    expect(screen.getByText(/quote of the day/i)).toBeInTheDocument();
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

  it('renders the copyright with the current year', () => {
    render(<App />);
    expect(screen.getByText(new RegExp(`©️ ${new Date().getFullYear()}`))).toBeInTheDocument();
  });

  it('filters quotes by collection with the chips', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Carl Jung' }));

    expect(screen.getByRole('heading', { level: 3 }).textContent).toMatch(/— Carl Jung$/);
    expect(screen.getByRole('button', { name: 'Carl Jung' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens the daily quote from a ?q=daily deep link', () => {
    const location = window.location;
    delete window.location;
    window.location = { search: '?q=daily' };
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      render(<App />);

      expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(todaysQuoteOfDay());
    } finally {
      window.location = location;
      delete window.HTMLElement.prototype.scrollIntoView;
    }
  });

  it('opens a specific quote from a ?q= deep link and selects its collection', () => {
    const location = window.location;
    delete window.location;
    window.location = { search: `?q=${encodeURIComponent(quotes[0])}` };

    try {
      render(<App />);

      expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(quotes[0]);
      expect(screen.getByRole('button', { name: 'Classics' })).toHaveAttribute('aria-pressed', 'true');
    } finally {
      window.location = location;
    }
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
      { id: expect.any(String), text: 'Test quote from me — Me', category: 'custom' },
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

  it('edits a custom quote and persists the change', () => {
    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /\+ add your own quote/i }));
    fireEvent.change(screen.getByLabelText(/your quote/i), {
      target: { value: 'Original wording — Me' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save quote/i }));

    fireEvent.click(screen.getByRole('button', { name: /edit this quote/i }));
    fireEvent.change(screen.getByLabelText(/edit quote/i), {
      target: { value: 'Edited wording — Me' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Edited wording — Me');
    expect(JSON.parse(window.localStorage.getItem('get-inspired:custom-quotes'))).toEqual([
      { id: expect.any(String), text: 'Edited wording — Me', category: 'custom' },
    ]);

    unmount();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'My quotes' }));
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Edited wording — Me');
  });

  it('cancels editing without changing the quote', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /\+ add your own quote/i }));
    fireEvent.change(screen.getByLabelText(/your quote/i), {
      target: { value: 'Keep me as I am — Me' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save quote/i }));

    fireEvent.click(screen.getByRole('button', { name: /edit this quote/i }));
    fireEvent.change(screen.getByLabelText(/edit quote/i), {
      target: { value: 'This should not stick — Me' },
    });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Keep me as I am — Me');
  });

  it('deletes a custom quote and empties the My quotes view', () => {
    const { rerender } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /\+ add your own quote/i }));
    fireEvent.change(screen.getByLabelText(/your quote/i), {
      target: { value: 'Doomed quote — Me' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save quote/i }));

    fireEvent.click(screen.getByRole('button', { name: /delete this quote/i }));

    expect(JSON.parse(window.localStorage.getItem('get-inspired:custom-quotes'))).toEqual([]);
    expect(screen.getByText(/no quotes in this collection yet/i)).toBeInTheDocument();
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

  it('copies a deep link to the current quote from the share menu', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    try {
      render(<App />);
      const quote = quoteText();

      fireEvent.click(screen.getByRole('button', { name: /share quote/i }));
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name: /copy link to quote/i }));
      });

      expect(writeText).toHaveBeenCalledTimes(1);
      const [copied] = writeText.mock.calls[0];
      expect(new URL(copied).searchParams.get('q')).toBe(quote);
    } finally {
      delete navigator.clipboard;
    }
  });

  it('copies today’s daily-quote link from the quote of the day card', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    try {
      render(<App />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
      });

      expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\?q=daily$/));
    } finally {
      delete navigator.clipboard;
    }
  });

  it('copies the quote of the day text from the card', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    try {
      render(<App />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy quote/i }));
      });

      expect(writeText).toHaveBeenCalledWith(todaysQuoteOfDay());
    } finally {
      delete navigator.clipboard;
    }
  });

  it('shows today’s quote in the feed from the quote of the day card', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /show today's quote in the feed/i }));

    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(todaysQuoteOfDay());
    expect(window.location.search).toBe('?q=daily');

    // Don't leak the query string into later tests.
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('opens the Facebook sharer with the site URL and quote', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    try {
      render(<App />);
      const quote = quoteText();

      fireEvent.click(screen.getByRole('button', { name: /share quote/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /facebook/i }));

      const [url] = openSpy.mock.calls[0];
      expect(url).toMatch(/^https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?/);
      const params = new URL(url).searchParams;
      expect(params.get('u')).toBe('https://jonnymexican.github.io/test/');
      expect(decodeURIComponent(params.get('quote'))).toContain(quote);
    } finally {
      openSpy.mockRestore();
    }
  });

  it('copies the quote and opens Instagram from the share menu', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    try {
      render(<App />);
      const quote = quoteText();

      fireEvent.click(screen.getByRole('button', { name: /share quote/i }));
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name: /instagram/i }));
      });

      expect(writeText).toHaveBeenCalledWith(quote);
      expect(openSpy).toHaveBeenCalledWith('https://www.instagram.com/', '_blank', expect.any(String));
    } finally {
      openSpy.mockRestore();
      delete navigator.clipboard;
    }
  });

  it('toggles to light theme and persists the choice', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('get-inspired:theme')).toBe('light');
    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /switch to dark mode/i }));

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('get-inspired:theme')).toBe('dark');
  });

  it('restores the saved theme on remount', () => {
    window.localStorage.setItem('get-inspired:theme', 'light');

    render(<App />);

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete navigator.clipboard;
  });
});

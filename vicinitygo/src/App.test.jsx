import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

const setup = () => {
  window.localStorage.clear();
  return render(<App />);
};

const startDistrictRun = () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: /explore a district by name/i }));
};

describe('vicinityGo first run', () => {
  it('renders the welcome screen with vibe and duration pickers', () => {
    setup();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/vicinity/i);
    expect(screen.getByRole('radio', { name: /nature/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /half hour/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /use my location/i })).toBeEnabled();
  });

  it('starts a district run and shows the quest list', () => {
    startDistrictRun();

    expect(screen.getByText(/quests near/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /checkpoints/i }).length).toBeGreaterThan(0);
  });

  it('opens quest detail with radar and checkpoints, then completes one', () => {
    startDistrictRun();

    const firstCard = screen.getAllByRole('button', { name: /checkpoints/i })[0];
    fireEvent.click(firstCard);

    expect(screen.getByRole('img', { name: /radar/i })).toBeInTheDocument();
    const detail = screen.getByRole('region', { name: /quest:/i });
    expect(within(detail).getAllByRole('button', { name: /i'm here/i }).length).toBeGreaterThan(0);

    const before = screen.getAllByText(/\d+\/\d+ checkpoints/i)[0].textContent;
    fireEvent.click(within(detail).getAllByRole('button', { name: /i'm here/i })[0]);
    expect(screen.getAllByText(/\d+\/\d+ checkpoints/i)[0].textContent).not.toBe(before);
  });

  it('awards XP when a quest is fully completed', () => {
    startDistrictRun();

    const card = screen.getAllByRole('button', { name: /checkpoints/i })[0];
    fireEvent.click(card);
    const detail = screen.getByRole('region', { name: /quest:/i });
    while (within(detail).queryAllByRole('button', { name: /i'm here/i }).length > 0) {
      fireEvent.click(within(detail).getAllByRole('button', { name: /i'm here/i })[0]);
    }

    expect(screen.getByText(/quest complete/i)).toBeInTheDocument();
    expect(screen.getByText(/✓ \d+ XP/)).toBeInTheDocument();
    expect(parseInt(screen.getByText(/\d+ XP ·/).textContent, 10)).toBeGreaterThan(0);
  });

  it('persists an in-flight run across remount', () => {
    window.localStorage.clear();
    const { unmount } = render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /explore a district by name/i }));
    const card = screen.getAllByRole('button', { name: /checkpoints/i })[0];
    fireEvent.click(card);
    const detail = screen.getByRole('region', { name: /quest:/i });
    fireEvent.click(within(detail).getAllByRole('button', { name: /i'm here/i })[0]);

    const saved = JSON.parse(window.localStorage.getItem('vicinitygo:progress'));
    expect(saved.quests.some((q) => q.checkpoints.some((c) => c.done))).toBe(true);

    // Fresh mount acts like a page reload: run is restored.
    unmount();
    render(<App />);
    expect(screen.getByText(/quests near/i)).toBeInTheDocument();
    expect(screen.getAllByText(/1\/\d+ checkpoints/i).length).toBeGreaterThan(0);
  });

  it('starts a new adventure from the stats bar, banking XP', () => {
    startDistrictRun();

    const card = screen.getAllByRole('button', { name: /checkpoints/i })[0];
    fireEvent.click(card);
    const detail = screen.getByRole('region', { name: /quest:/i });
    while (within(detail).queryAllByRole('button', { name: /i'm here/i }).length > 0) {
      fireEvent.click(within(detail).getAllByRole('button', { name: /i'm here/i })[0]);
    }
    const xpText = screen.getByText(/\d+ XP ·/).textContent;
    const earned = parseInt(xpText, 10);
    expect(earned).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /new/i }));
    expect(screen.getByRole('button', { name: /use my location/i })).toBeInTheDocument();

    // XP survives via banking on the next run start.
    fireEvent.click(screen.getByRole('button', { name: /explore a district by name/i }));
    const xpAfter = parseInt(screen.getByText(/\d+ XP ·/).textContent, 10);
    expect(xpAfter).toBeGreaterThanOrEqual(earned);
  });
});

describe('vicinityGo location denied', () => {
  it('keeps the welcome usable when geolocation is missing', async () => {
    window.localStorage.clear();
    const original = navigator.geolocation;
    delete navigator.geolocation;

    try {
      render(<App />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /use my location/i }));
      });

      expect(screen.getByRole('alert')).toHaveTextContent(/location unavailable/i);
      expect(screen.getByRole('button', { name: /explore a district by name/i })).toBeEnabled();
    } finally {
      Object.defineProperty(navigator, 'geolocation', {
        value: original,
        configurable: true,
        writable: true,
      });
    }
  });
});

describe('vicinityGo share target', () => {
  const originalFetch = global.fetch;

  const landWithSearch = (search) => {
    window.localStorage.clear();
    window.history.pushState(null, '', `/${search}`);
  };

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('auto-starts a run around a shared place with coordinates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    landWithSearch('?title=Space+Needle&url=https%3A%2F%2Fmaps.google.com%2F%4047.6205%2C-122.3493%2C17z');

    render(<App />);

    // OSM is unreachable in tests → fictional districts around the point.
    expect(await screen.findByText(/quests near Shared place/i)).toBeInTheDocument();
    expect(window.location.search).toBe(''); // share consumed
  });

  it('shows a dismissible banner for shares without coordinates', () => {
    landWithSearch('?text=check+out+this+cool+bench');

    render(<App />);

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(/check out this cool bench/i);
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    // No run was started.
    expect(screen.getByRole('button', { name: /use my location/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not hijack an active run when a share lands mid-adventure', () => {
    landWithSearch('?text=47.5,-122.3');
    window.localStorage.setItem(
      'vicinitygo:progress',
      JSON.stringify({
        origin: { lat: 47.6, lng: -122.33 },
        city: 'Capitol Hill',
        quests: [{ id: 'q1', done: false, xp: 30, checkpoints: [] }],
        bankedXp: 0,
      })
    );

    render(<App />);

    expect(screen.getByText(/quests near Capitol Hill/i)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

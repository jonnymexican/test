// Full-app smoke test: renders the real App and plays a day the way a
// player would, against an in-memory fake of the bureau-vault Worker.
// A failure here blocks the Pages deploy.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import App from './App';
import { getPuzzle } from './puzzle';

const VAULT_URL = 'https://bureau-vault.jonnymexican.workers.dev';

/** Minimal in-memory bureau-vault: /league routes + 404 for unknown codes. */
function makeVault() {
  const store = new Map();
  return {
    store,
    fetch: async (url, opts = {}) => {
      const m = String(url).match(/\/league\/([A-Za-z0-9-]+)$/);
      if (!m) return { ok: false, status: 404, json: async () => ({ error: 'not_found' }) };
      const code = m[1];
      if (opts.headers?.['x-vault-code'] !== code) {
        return { ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) };
      }
      const method = opts.method || 'GET';
      if (method === 'GET') {
        if (!store.has(code)) return { ok: false, status: 404, json: async () => ({ error: 'unknown_league' }) };
        return { ok: true, status: 200, json: async () => JSON.parse(store.get(code)) };
      }
      if (method === 'PUT') {
        const body = JSON.parse(opts.body);
        if (store.has(code)) {
          const remote = JSON.parse(store.get(code));
          if ((remote.v ?? 1) !== body.expectedV) {
            return { ok: false, status: 409, json: async () => ({ error: 'conflict', remoteV: remote.v ?? 1 }) };
          }
        } else if (body.expectedV !== 0) {
          return { ok: false, status: 409, json: async () => ({ error: 'conflict', remoteV: 0 }) };
        }
        const next = { v: body.expectedV + 1, ...body.state, updatedAt: 'now' };
        store.set(code, JSON.stringify(next));
        return { ok: true, status: 200, json: async () => ({ ok: true, v: next.v }) };
      }
      if (method === 'DELETE') {
        const existed = store.has(code);
        store.delete(code);
        return { ok: true, status: 200, json: async () => ({ ok: true, existed }) };
      }
      return { ok: false, status: 405, json: async () => ({ error: 'method_not_allowed' }) };
    },
  };
}

let vault;

beforeEach(() => {
  window.localStorage.clear();
  vault = makeVault();
  vi.spyOn(global, 'fetch').mockImplementation(vault.fetch);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function registerAndJoin(name = 'Jon') {
  // Identity first (the board needs a player).
  fireEvent.change(screen.getByLabelText('Player name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: /that's me/i }));

  // Join a fresh league via the custom-code form.
  fireEvent.change(screen.getByLabelText('Vault URL'), { target: { value: VAULT_URL } });
  fireEvent.change(screen.getByLabelText('League code'), { target: { value: 'PL-TEST-01' } });
  fireEvent.click(screen.getByRole('button', { name: /join league/i }));
  await waitFor(() => expect(screen.getByText('PL-TEST-01')).toBeTruthy());
}

describe('Daily Puzzle League smoke', () => {
  it('plays today: start clue-free (2 free clues), solve, see score + board row', async () => {
    render(<App />);
    await registerAndJoin('Jon');

    // Two clues are free; the rest start hidden.
    const revealed = screen.getAllByText(/one of the numbers is|□ \+ □ =|▢ \+ ▢ =/i);
    expect(revealed.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/clue #3 — hidden/i)).toBeTruthy();

    // Solve using today's hidden solution.
    const puzzle = getPuzzle(new Date());
    fireEvent.change(screen.getByLabelText('Your four numbers'), {
      target: { value: puzzle.solution.join(' ') },
    });
    fireEvent.click(screen.getByRole('button', { name: /guess/i }));

    await waitFor(() => expect(screen.getByText(/cracked it/i)).toBeTruthy());
    expect(screen.getByText(new RegExp(puzzle.solution.join(' · ')))).toBeTruthy();
    expect(screen.getByText(/\+\d+ pts/i)).toBeTruthy();

    // The league board now shows Jon's row.
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    expect(screen.getAllByText('Jon').length).toBeGreaterThan(0); // board row + identity card
    expect(vault.store.has('PL-TEST-01')).toBe(true);
  });

  it('rejects a wrong guess, reveals a clue, then solves', async () => {
    render(<App />);
    const puzzle = getPuzzle(new Date());
    const outside = puzzle.solution.includes(9) ? [2, 3, 4, 5] : [2, 3, 4, 9];
    if (outside.join() === puzzle.solution.join()) outside[0] += 1;

    fireEvent.change(screen.getByLabelText('Your four numbers'), { target: { value: outside.join(' ') } });
    fireEvent.click(screen.getByRole('button', { name: /guess/i }));
    expect(await screen.findByText(/breaks at least one clue/i)).toBeTruthy();

    // Reveal clue #3 — the masked row should disappear.
    fireEvent.click(screen.getByRole('button', { name: /reveal another clue/i }));
    await waitFor(() => expect(screen.queryByText(/clue #3 — hidden/i)).toBeNull());

    fireEvent.change(screen.getByLabelText('Your four numbers'), {
      target: { value: puzzle.solution.join(' ') },
    });
    fireEvent.click(screen.getByRole('button', { name: /guess/i }));
    await waitFor(() => expect(screen.getByText(/cracked it/i)).toBeTruthy());
    expect(screen.getByText(/3 clues/i)).toBeTruthy(); // scored with the revealed clue counted
  });

  it('persists the player, solve, and league across a remount', async () => {
    const first = render(<App />);
    await registerAndJoin('Jon');
    const puzzle = getPuzzle(new Date());
    fireEvent.change(screen.getByLabelText('Your four numbers'), {
      target: { value: puzzle.solution.join(' ') },
    });
    fireEvent.click(screen.getByRole('button', { name: /guess/i }));
    await waitFor(() => expect(screen.getByText(/cracked it/i)).toBeTruthy());
    first.unmount();

    render(<App />);
    // Still solved, still Jon, still joined.
    expect(screen.getByText(/cracked it/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/playing as/i)).toBeTruthy());
    await waitFor(() => expect(screen.getByText('PL-TEST-01')).toBeTruthy());
  });

  it("shows a second player's remote result on the board after sync", async () => {
    // Someone else already solved day 99 in the same league.
    vault.store.set(
      'PL-SHARED',
      JSON.stringify({
        v: 2,
        players: [{ id: 'sam-remote', name: 'Sam', createdAt: 1, updatedAt: 1 }],
        results: [{ id: 'sam-remote:99', playerId: 'sam-remote', dayNum: 99, base: 90, clues: 2, guesses: 1, createdAt: 1, updatedAt: 1 }],
        tombstones: [],
      })
    );
    render(<App />);
    fireEvent.change(screen.getByLabelText('Vault URL'), { target: { value: VAULT_URL } });
    fireEvent.change(screen.getByLabelText('League code'), { target: { value: 'PL-SHARED' } });
    fireEvent.click(screen.getByRole('button', { name: /join league/i }));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.getByText('90')).toBeTruthy();
  });
});

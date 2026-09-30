import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearMe,
  clearVaultSettings,
  computeLeaderboard,
  leagueFetch,
  createLeague,
  loadMe,
  loadVaultSettings,
  makePlayerId,
  mergeLeague,
  normalizeName,
  saveMe,
  saveVaultSettings,
  suggestLeagueCode,
  syncLeague,
  VaultError,
} from './leagueSync';

describe('settings & identity persistence', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips vault settings and rejects junk', () => {
    expect(loadVaultSettings()).toBeNull();
    saveVaultSettings({ url: 'https://vault.example', code: 'PL-XX' });
    expect(loadVaultSettings()).toEqual({ url: 'https://vault.example', code: 'PL-XX' });
    window.localStorage.setItem('puzzleleague:vault-settings', '{oops');
    expect(loadVaultSettings()).toBeNull();
    clearVaultSettings();
    expect(loadVaultSettings()).toBeNull();
  });

  it('round-trips the player identity', () => {
    expect(loadMe()).toBeNull();
    saveMe({ id: 'p-1', name: 'Jon', createdAt: 1, updatedAt: 1 });
    expect(loadMe()).toEqual({ id: 'p-1', name: 'Jon', createdAt: 1, updatedAt: 1 });
    clearMe();
    expect(loadMe()).toBeNull();
  });

  it('normalizes names and makes usable ids/codes', () => {
    expect(normalizeName('  Jon   voigt ')).toBe('Jon voigt');
    expect(normalizeName('   ')).toBe('');
    expect(normalizeName(undefined)).toBe('');
    expect(makePlayerId()).toMatch(/^p-[a-z0-9]+$/);
    expect(suggestLeagueCode()).toMatch(/^[A-Z]+-[A-Z]+-\d+$/);
  });
});

describe('mergeLeague', () => {
  const item = (id, updatedAt, extra = {}) => ({ id, updatedAt, ...extra });

  it('unions by id with newest-wins', () => {
    const merged = mergeLeague(
      { players: [item('a', 10, { name: 'A' })], results: [item('r1', 5)], tombstones: [] },
      { players: [item('a', 20, { name: 'A2' })], results: [item('r2', 6)], tombstones: [] }
    );
    expect(merged.state.players).toEqual([item('a', 20, { name: 'A2' })]);
    expect(merged.state.results.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('tombstones kill live items only at or after their time', () => {
    const merged = mergeLeague(
      { players: [item('a', 10)], results: [], tombstones: [] },
      { players: [], results: [], tombstones: [item('a', 12, { deletedAt: 12 })] }
    );
    expect(merged.state.players).toEqual([]);

    const survivor = mergeLeague(
      { players: [item('a', 15)], results: [], tombstones: [] }, // edited after delete
      { players: [], results: [], tombstones: [item('a', 12, { deletedAt: 12 })] }
    );
    expect(survivor.state.players).toEqual([item('a', 15)]);
  });

  it('unions tombstones so deletions propagate', () => {
    const merged = mergeLeague(
      { players: [], results: [], tombstones: [item('x', 1, { deletedAt: 1 })] },
      { players: [], results: [], tombstones: [item('y', 2, { deletedAt: 2 })] }
    );
    expect(merged.state.tombstones.map((t) => t.id).sort()).toEqual(['x', 'y']);
  });
});

describe('computeLeaderboard', () => {
  it('ranks by total, joins names, and counts streaks', () => {
    const today = 100;
    const players = [
      { id: 'p1', name: 'Jon' },
      { id: 'p2', name: 'Sam' },
    ];
    const results = [
      { id: 'p1:98', playerId: 'p1', dayNum: 98, base: 100 },
      { id: 'p1:99', playerId: 'p1', dayNum: 99, base: 80 },
      { id: 'p2:99', playerId: 'p2', dayNum: 99, base: 95 },
    ];
    const rows = computeLeaderboard(players, results, today);
    // p1 solved 98+99 → streak 2 (today unsolved, counts back from yesterday); p2 only 99 → 1.
    expect(rows[0]).toMatchObject({ playerId: 'p1', name: 'Jon', total: 180, solved: 2, best: 100, streak: 2 });
    expect(rows[1]).toMatchObject({ playerId: 'p2', total: 95, streak: 1 });
    expect(rows.map((r) => r.total)).toEqual([...rows.map((r) => r.total)].sort((a, b) => b - a));
  });

  it('reports per-player today status for the daily board', () => {
    const today = 100;
    const players = [
      { id: 'p1', name: 'Jon' },
      { id: 'p2', name: 'Sam' },
    ];
    const results = [
      { id: 'p1:100', playerId: 'p1', dayNum: 100, base: 110, clues: 3 },
      { id: 'p1:99', playerId: 'p1', dayNum: 99, base: 80, clues: 4 },
    ];
    const rows = computeLeaderboard(players, results, today);
    expect(rows[0].today).toEqual({ solved: true, clues: 3 });
    expect(rows[1].today).toEqual({ solved: false, clues: null });
  });

  it('does not count junk clue values for the today panel', () => {
    const rows = computeLeaderboard(
      [{ id: 'p1', name: 'Jon' }],
      [{ id: 'p1:100', playerId: 'p1', dayNum: 100, base: 60, clues: 'lots' }],
      100
    );
    expect(rows[0].today).toEqual({ solved: true, clues: 0 });
  });

  it('ignores results for unknown players and junk day numbers', () => {
    const rows = computeLeaderboard([{ id: 'p1', name: 'Jon' }], [{ id: 'x:abc', playerId: 'zz', dayNum: 'abc', base: 5 }], 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(0);
  });
});

// ---------- API layer (fetch mocked) ----------

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('sync & create (fetch mocked)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('merges remote into local and pushes back when local has more', async () => {
    const remote = {
      v: 3,
      players: [{ id: 'sam', name: 'Sam', updatedAt: 5 }],
      results: [{ id: 'sam:9', playerId: 'sam', dayNum: 9, base: 90, updatedAt: 5 }],
      tombstones: [],
    };
    const local = {
      players: [{ id: 'jon', name: 'Jon', updatedAt: 6 }],
      results: [{ id: 'jon:9', playerId: 'jon', dayNum: 9, base: 70, updatedAt: 6 }],
      tombstones: [],
    };
    const pushes = [];
    const calls = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (url, opts = {}) => {
      calls.push({ url, method: opts.method });
      if (opts.method === 'GET') return jsonResponse(remote);
      pushes.push(JSON.parse(opts.body));
      return jsonResponse({ ok: true, v: 4 });
    });

    const res = await syncLeague('https://v', 'PL-CODE', () => local, () => {});
    expect(res).toEqual({ v: 4, changed: true });
    expect(calls[0]).toEqual({ url: 'https://v/league/PL-CODE', method: 'GET' });
    expect(pushes[0].expectedV).toBe(3);
    expect(pushes[0].state.players.map((p) => p.id).sort()).toEqual(['jon', 'sam']);
    expect(pushes[0].state.results.map((r) => r.id).sort()).toEqual(['jon:9', 'sam:9']);
  });

  it('skips the push when remote already has everything newer', async () => {
    const remote = {
      v: 7,
      players: [{ id: 'jon', name: 'Jon', updatedAt: 9 }],
      results: [],
      tombstones: [],
    };
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(async () => jsonResponse(remote));
    const res = await syncLeague('https://v', 'C', () => ({ players: [], results: [], tombstones: [] }), () => {});
    expect(res).toEqual({ v: 7, changed: false });
    expect(fetchMock).toHaveBeenCalledTimes(1); // GET only, no PUT
  });

  it('retries once after a CAS conflict', async () => {
    const remoteV1 = { v: 1, players: [], results: [], tombstones: [] };
    const local = { players: [{ id: 'jon', name: 'Jon', updatedAt: 10 }], results: [], tombstones: [] };
    let gets = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, opts = {}) => {
      if (opts.method === 'GET') {
        gets += 1;
        return jsonResponse(remoteV1);
      }
      // First PUT conflicts (someone moved to v2), second succeeds.
      return gets === 1 ? jsonResponse({ error: 'conflict', remoteV: 2 }, 409) : jsonResponse({ ok: true, v: 3 });
    });
    const res = await syncLeague('https://v', 'C', () => local, () => {});
    expect(res.v).toBe(3);
    expect(gets).toBe(2);
  });

  it('creates a fresh league with expectedV 0', async () => {
    const pushes = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, opts = {}) => {
      if (opts.method === 'PUT') pushes.push(JSON.parse(opts.body));
      return jsonResponse({ ok: true, v: 1 });
    });
    const local = { players: [{ id: 'p1', name: 'J' }], results: [], tombstones: [] };
    const res = await createLeague('https://v', 'NEW-1', () => local);
    expect(res.v).toBe(1);
    expect(pushes[0].expectedV).toBe(0);
  });

  it('maps error statuses to VaultError codes', async () => {
    for (const [status, expected] of [[401, 'unauthorized'], [404, 'unknown_league'], [409, 'conflict'], [500, 'bad_response']]) {
      vi.spyOn(global, 'fetch').mockImplementation(async () => jsonResponse({ error: 'x' }, status));
      await expect(leagueFetch('https://v', 'C')).rejects.toMatchObject({ code: expected });
      vi.restoreAllMocks();
    }
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      throw new Error('offline');
    });
    await expect(leagueFetch('https://v', 'C')).rejects.toMatchObject({ code: 'network' });
    vi.restoreAllMocks();
    vi.spyOn(global, 'fetch').mockImplementation(async () => ({ ok: false, status: 500, json: async () => { throw new Error('no json'); } }));
    await expect(leagueFetch('https://v', 'C')).rejects.toMatchObject({ code: 'bad_response' });
  });
});

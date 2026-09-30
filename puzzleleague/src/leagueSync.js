/**
 * Daily Puzzle League — shared-league sync client.
 *
 * Talks to the same bureau-vault Worker as FriendCredit and adhdTracker.
 * A league is one vault bureau: the code is the credential, everyone who
 * has it reads and writes the same { players, results, tombstones } state.
 *
 *   players    [{ id, name, createdAt, updatedAt }]
 *   results    [{ id: "<playerId>:<dayNum>", playerId, dayNum, clues, guesses,
 *                 base, createdAt, updatedAt }]   — one per player per day
 *   tombstones [{ id, deletedAt }]               — leave/rename bookkeeping
 *
 * Merge rules (same as the other apps): union by id, newest
 * updatedAt ?? createdAt wins; a tombstone kills a live item only when the
 * item's time is ≤ the tombstone's deletedAt (newer edits survive).
 */

const SETTINGS_KEY = 'puzzleleague:vault-settings';
const ME_KEY = 'puzzleleague:me';

// ---------- settings & identity ----------

export function loadVaultSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s.url !== 'string' || typeof s.code !== 'string' || !s.url || !s.code) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveVaultSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* private mode etc. — sync just won't persist */
  }
}

export function clearVaultSettings() {
  try {
    window.localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* ignore */
  }
}

export function loadMe() {
  try {
    const raw = window.localStorage.getItem(ME_KEY);
    if (!raw) return null;
    const me = JSON.parse(raw);
    if (!me || typeof me.id !== 'string' || typeof me.name !== 'string' || !me.id || !me.name) return null;
    return me;
  } catch {
    return null;
  }
}

export function saveMe(me) {
  try {
    window.localStorage.setItem(ME_KEY, JSON.stringify(me));
  } catch {
    /* ignore */
  }
}

export function clearMe() {
  try {
    window.localStorage.removeItem(ME_KEY);
  } catch {
    /* ignore */
  }
}

export function makePlayerId() {
  return `p-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
}

/** A friendly, shareable league code, e.g. "OTTER-COMET-42". */
export function suggestLeagueCode() {
  const words = [
    'OTTER', 'FALCON', 'MAPLE', 'COMET', 'NOVA', 'PIXEL', 'TANGO', 'MANGO',
    'RAVEN', 'SUMMIT', 'CIRCUIT', 'JUNIPER', 'HARBOR', 'ZEPHYR', 'QUARTZ', 'LYNX',
  ];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 90) + 10}`;
}

// ---------- merging ----------

const itemTime = (x) => Number(x.updatedAt ?? x.createdAt ?? 0);

function unionByTime(localList, remoteList) {
  const byId = new Map();
  for (const item of localList || []) byId.set(item.id, item);
  for (const item of remoteList || []) {
    byId.set(item.id, !byId.has(item.id) || itemTime(item) > itemTime(byId.get(item.id)) ? item : byId.get(item.id));
  }
  return byId;
}

/**
 * Merges two league states. Returns { state: { players, results, tombstones } }.
 * Tombstones are unioned too, so deletions keep propagating.
 */
export function mergeLeague(local, remote) {
  const players = unionByTime(local.players, remote.players);
  const results = unionByTime(local.results, remote.results);
  const tombstones = unionByTime(local.tombstones, remote.tombstones);

  for (const [id, tb] of tombstones) {
    const tTime = Number(tb.deletedAt || 0);
    for (const list of [players, results]) {
      const item = list.get(id);
      if (item && itemTime(item) <= tTime) list.delete(id);
    }
  }

  return {
    state: {
      players: [...players.values()],
      results: [...results.values()],
      tombstones: [...tombstones.values()],
    },
  };
}

// ---------- leaderboard ----------

/**
 * Joins players to their results and ranks them.
 * Rows: { playerId, name, total, solved, best, avgClues, streak }.
 * Rank: total desc → best single-day desc → name asc.
 */
export function computeLeaderboard(players, results, todayDayNum) {
  const byPlayer = new Map();
  for (const r of results || []) {
    const list = byPlayer.get(r.playerId) || [];
    list.push(r);
    byPlayer.set(r.playerId, list);
  }
  const rows = (players || [])
    .map((p) => {
      const mine = (byPlayer.get(p.id) || []).filter((r) => Number.isFinite(Number(r.dayNum)));
      const scores = mine.map((r) => Number(r.base) || 0);
      const clues = mine.map((r) => Number(r.clues) || 0);
      const todayResult = mine.find((r) => Number(r.dayNum) === todayDayNum);
      return {
        playerId: p.id,
        name: p.name,
        total: scores.reduce((a, b) => a + b, 0),
        solved: mine.length,
        best: scores.length ? Math.max(...scores) : 0,
        avgClues: clues.length ? clues.reduce((a, b) => a + b, 0) / clues.length : 0,
        streak: 0,
        days: mine.map((r) => Number(r.dayNum)),
        // Today at a glance: has this player cracked the daily yet, and how
        // many clues did it take? (Powers the "Today" section of the board.)
        today: todayResult ? { solved: true, clues: Number(todayResult.clues) || 0 } : { solved: false, clues: null },
      };
    })
    .map((row) => ({ ...row, streak: computeRowStreak(row.days, todayDayNum) }))
    .sort((a, b) => b.total - a.total || b.best - a.best || a.name.localeCompare(b.name));
  return rows;
}

function computeRowStreak(days, todayDayNum) {
  const set = new Set(days);
  let cursor = set.has(todayDayNum) ? todayDayNum : todayDayNum - 1;
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

// ---------- API ----------

export class VaultError extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.name = 'VaultError';
    this.code = code;
    Object.assign(this, extra);
  }
}

async function call(url, path, options) {
  let res;
  try {
    res = await fetch(url + path, options);
  } catch {
    throw new VaultError('network');
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    throw new VaultError('bad_response');
  }
  if (!res.ok) {
    const code =
      res.status === 401
        ? 'unauthorized'
        : res.status === 404
          ? 'unknown_league'
          : res.status === 409
            ? 'conflict'
            : 'bad_response';
    throw new VaultError(code, { status: res.status, remoteV: body?.remoteV });
  }
  return body;
}

/** Fetch the remote league state. Throws VaultError. */
export function leagueFetch(url, code) {
  return call(url, `/league/${code}`, { method: 'GET', headers: { 'x-vault-code': code } });
}

/** Push a league state with CAS on version. Throws VaultError('conflict'). */
export function leaguePush(url, code, expectedV, state) {
  return call(url, `/league/${code}`, {
    method: 'PUT',
    headers: { 'x-vault-code': code, 'content-type': 'application/json' },
    body: JSON.stringify({ expectedV, state }),
  });
}

/**
 * Pull remote, merge into local, push back when the merge added anything.
 * `getLocal()` → { players, results, tombstones }; `setLocal(state)` applies.
 * Returns { v, changed }. Retries once on CAS conflict (re-pull, re-merge, re-push).
 */
export async function syncLeague(url, code, getLocal, setLocal) {
  const attempt = async () => {
    const remote = await leagueFetch(url, code);
    const { state } = mergeLeague(getLocal(), remote);
    const remoteItems = new Map(
      [...(remote.players || []), ...(remote.results || []), ...(remote.tombstones || [])].map((x) => [x.id, x])
    );
    const localById = new Map(
      [...state.players, ...state.results, ...state.tombstones].map((x) => [x.id, x])
    );
    let changed = false;
    for (const [id, item] of localById) {
      const remoteItem = remoteItems.get(id);
      if (!remoteItem || itemTime(item) > itemTime(remoteItem)) {
        changed = true;
        break;
      }
    }
    let v = remote.v ?? 1;
    if (changed) {
      const pushed = await leaguePush(url, code, remote.v ?? 1, state);
      v = pushed.v;
    }
    setLocal(state);
    return { v, changed };
  };

  try {
    return await attempt();
  } catch (err) {
    if (err.code !== 'conflict') throw err;
    return attempt(); // someone pushed mid-sync; merge again on the new version
  }
}

/** Push-only variant used to CREATE a fresh league from local state. */
export async function createLeague(url, code, getLocal) {
  const pushed = await leaguePush(url, code, 0, getLocal());
  return { v: pushed.v, changed: true };
}

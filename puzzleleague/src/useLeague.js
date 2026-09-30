import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  checkGuess,
  computeStreak,
  dayNumFor,
  getPuzzle,
  scoreFor,
  MIN_STARTING_CLUES,
} from './puzzle';
import {
  clearMe,
  clearVaultSettings,
  computeLeaderboard,
  createLeague,
  loadMe,
  loadVaultSettings,
  makePlayerId,
  normalizeName,
  saveMe,
  saveVaultSettings,
  syncLeague,
} from './leagueSync';

const HISTORY_KEY = 'puzzleleague:history';
const TOMBS_KEY = 'puzzleleague:tombstones';

function loadHistory() {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const h = raw ? JSON.parse(raw) : {};
    return h && typeof h === 'object' && !Array.isArray(h) ? h : {};
  } catch {
    return {};
  }
}

function saveHistory(history) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* ignore */
  }
}

function loadTombstones() {
  try {
    const raw = window.localStorage.getItem(TOMBS_KEY);
    const t = raw ? JSON.parse(raw) : [];
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

function saveTombstones(tombs) {
  try {
    window.localStorage.setItem(TOMBS_KEY, JSON.stringify(tombs));
  } catch {
    /* ignore */
  }
}

const VAULT_ERROR_MSG = {
  network: 'Could not reach the vault URL.',
  unauthorized: 'That league code was rejected.',
  unknown_league: 'No league with that code (it will be created if you own the code).',
  conflict: 'The league changed elsewhere; retrying…',
  bad_response: 'The vault sent something unexpected.',
  bad_request: 'The vault rejected that update.',
};

/**
 * One hook to run the whole game:
 *  - daily puzzle + local solve history + streak
 *  - player identity (register once per device)
 *  - shared league via the bureau vault (join by code, 30s poll, debounced push)
 */
export function useLeague() {
  const today = useMemo(() => new Date(), []);
  const todayDayNum = useMemo(() => dayNumFor(today), [today]);
  const puzzle = useMemo(() => getPuzzle(today), [today]);

  const [history, setHistory] = useState(loadHistory);
  const [guesses, setGuesses] = useState(0);
  const [me, setMe] = useState(loadMe);
  const [board, setBoard] = useState([]);
  const [vaultInfo, setVaultInfo] = useState(loadVaultSettings);
  const [vaultStatus, setVaultStatus] = useState('idle');
  const [vaultError, setVaultError] = useState('');

  const historyRef = useRef(history);
  historyRef.current = history;
  const meRef = useRef(me);
  meRef.current = me;
  const tombsRef = useRef(loadTombstones());
  const playersRef = useRef([]);
  const resultsRef = useRef([]);
  const vault = useRef(vaultInfo);
  const vaultV = useRef(0);
  const vaultBusy = useRef(false);

  const todayEntry = history[todayDayNum] || null;
  const solved = Boolean(todayEntry && todayEntry.solvedAt);
  const streak = useMemo(
    () =>
      computeStreak(
        Object.keys(history)
          .filter((d) => history[d] && history[d].solvedAt)
          .map(Number),
        todayDayNum
      ),
    [history, todayDayNum]
  );

  const applyLeagueState = useCallback((state) => {
    const tombs = Array.isArray(state.tombstones) ? state.tombstones : [];
    tombsRef.current = tombs;
    saveTombstones(tombs);
    playersRef.current = state.players || [];
    resultsRef.current = state.results || [];

    // Adopt a newer name for this device's player if someone edited it.
    const current = meRef.current;
    if (current) {
      const mine = playersRef.current.find((p) => p.id === current.id);
      if (mine && String(mine.name) !== current.name) {
        const next = { ...current, name: mine.name, updatedAt: mine.updatedAt };
        meRef.current = next;
        setMe(next);
        saveMe(next);
      }
    }

    // Prune locally-solved days whose results were deleted elsewhere.
    const currentHistory = { ...historyRef.current };
    let pruned = false;
    if (current) {
      for (const [dayKey, entry] of Object.entries(currentHistory)) {
        const id = `${current.id}:${dayKey}`;
        const tb = tombs.find((t) => t.id === id);
        if (tb && Number(entry.solvedAt || 0) <= Number(tb.deletedAt || 0)) {
          delete currentHistory[dayKey];
          pruned = true;
        }
      }
      if (pruned) {
        historyRef.current = currentHistory;
        setHistory(currentHistory);
        saveHistory(currentHistory);
      }
    }

    setBoard(computeLeaderboard(playersRef.current, resultsRef.current, todayDayNumRef.current));
  }, []);

  // todayDayNum is stable; keep a ref so applyLeagueState stays dep-free.
  const todayDayNumRef = useRef(todayDayNum);
  todayDayNumRef.current = todayDayNum;

  const getLeagueState = useCallback(() => {
    const current = meRef.current;
    const players = [...playersRef.current];
    if (current) {
      const i = players.findIndex((p) => p.id === current.id);
      const mePlayer = {
        id: current.id,
        name: current.name,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt ?? current.createdAt,
      };
      if (i >= 0) players[i] = mePlayer;
      else players.push(mePlayer);
    }
    const results = [];
    if (current) {
      for (const [dayKey, entry] of Object.entries(historyRef.current)) {
        if (!entry || !entry.solvedAt) continue; // partial entries (revealed clues) stay local
        results.push({
          id: `${current.id}:${dayKey}`,
          playerId: current.id,
          dayNum: Number(dayKey),
          clues: entry.clues,
          guesses: entry.guesses,
          base: entry.base,
          createdAt: entry.solvedAt,
          updatedAt: entry.solvedAt,
        });
      }
    }
    return { players, results, tombstones: tombsRef.current };
  }, []);

  const runSync = useCallback(async () => {
    if (!vault.current || vaultBusy.current) return;
    vaultBusy.current = true;
    setVaultStatus('syncing');
    try {
      const res = await syncLeague(vault.current.url, vault.current.code, getLeagueState, applyLeagueState);
      vaultV.current = res.v;
      setVaultStatus('ok');
      setVaultError('');
    } catch (err) {
      setVaultStatus('error');
      setVaultError(VAULT_ERROR_MSG[err.code] || 'Sync problem.');
    } finally {
      vaultBusy.current = false;
    }
  }, [getLeagueState, applyLeagueState]);

  // Initial sync + 30s poll while joined.
  useEffect(() => {
    if (!vaultInfo) return undefined;
    vault.current = vaultInfo;
    let alive = true;
    const run = () => {
      if (alive) runSync();
    };
    run();
    const timer = setInterval(run, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [vaultInfo, runSync]);

  const pushTimer = useRef(null);
  const queueVaultPush = useCallback(() => {
    if (!vault.current || vaultBusy.current) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(runSync, 1200);
  }, [runSync]);

  const startLeague = useCallback(
    async (url, code) => {
      const saved = { url: url.trim().replace(/\/+$/, ''), code: code.trim() };
      vault.current = saved;
      setVaultStatus('syncing');
      try {
        const res = await syncLeague(saved.url, saved.code, getLeagueState, applyLeagueState);
        vaultV.current = res.v;
      } catch (err) {
        if (err.code === 'unknown_league') {
          // Fresh code: the first joiner creates the league from local history.
          const pushed = await createLeague(saved.url, saved.code, getLeagueState);
          vaultV.current = pushed.v;
          applyLeagueState(getLeagueState()); // show the board without waiting for the first poll
        } else {
          vault.current = null;
          setVaultStatus('idle');
          throw err;
        }
      }
      saveVaultSettings(saved);
      setVaultInfo(saved);
      setVaultStatus('ok');
      setVaultError('');
    },
    [getLeagueState, applyLeagueState]
  );

  const stopLeague = useCallback(() => {
    clearTimeout(pushTimer.current);
    clearVaultSettings();
    vault.current = null;
    vaultV.current = 0;
    playersRef.current = [];
    resultsRef.current = [];
    setVaultInfo(null);
    setVaultStatus('idle');
    setVaultError('');
    setBoard([]);
  }, []);

  const register = useCallback(
    (rawName) => {
      const name = normalizeName(rawName);
      if (!name) throw new Error('empty');
      const now = Date.now();
      const current = meRef.current;
      const next = current
        ? { ...current, name, updatedAt: now }
        : { id: makePlayerId(), name, createdAt: now, updatedAt: now };
      meRef.current = next;
      setMe(next);
      saveMe(next);
      queueVaultPush();
      return next;
    },
    [queueVaultPush]
  );

  const revealClue = useCallback(() => {
    if (historyRef.current[todayDayNum]?.solvedAt) return; // already solved
    const current = historyRef.current[todayDayNum];
    const revealed = Math.min((current?.clues ?? MIN_STARTING_CLUES) + 1, puzzle.clues.length);
    const entry = {
      clues: revealed,
      guesses: current?.guesses ?? 0,
      base: 0,
      solvedAt: null,
    };
    const next = { ...historyRef.current, [todayDayNum]: entry };
    historyRef.current = next;
    setHistory(next);
    saveHistory(next);
  }, [puzzle, todayDayNum]);

  const solveDay = useCallback(
    (guess) => {
      if (!checkGuess(puzzle, guess)) {
        setGuesses((g) => g + 1);
        return false;
      }
      const existing = historyRef.current[todayDayNum];
      if (existing?.solvedAt) return true; // already solved today
      const clues = existing?.clues ?? puzzle.clues.length;
      const entry = {
        clues,
        guesses: guesses + 1,
        base: scoreFor(clues, guesses + 1),
        solvedAt: Date.now(),
      };
      const next = { ...historyRef.current, [todayDayNum]: entry };
      historyRef.current = next;
      setHistory(next);
      saveHistory(next);
      queueVaultPush();
      return true;
    },
    [puzzle, todayDayNum, guesses, queueVaultPush]
  );

  const signOut = useCallback(() => {
    // Removes this device's player from the league (tombstoned on next sync).
    const current = meRef.current;
    if (!current) return;
    const now = Date.now();
    tombsRef.current = [
      ...tombsRef.current,
      { id: current.id, deletedAt: now },
      ...Object.keys(historyRef.current).map((d) => ({ id: `${current.id}:${d}`, deletedAt: now })),
    ];
    saveTombstones(tombsRef.current);
    clearMe();
    meRef.current = null;
    setMe(null);
    queueVaultPush();
  }, [queueVaultPush]);

  return {
    todayDayNum,
    puzzle,
    minStartingClues: MIN_STARTING_CLUES,
    todayEntry,
    solved,
    streak,
    guesses,
    history,
    me,
    board,
    vaultInfo,
    vaultStatus,
    vaultError,
    register,
    startLeague,
    stopLeague,
    solveDay,
    revealClue,
    signOut,
  };
}

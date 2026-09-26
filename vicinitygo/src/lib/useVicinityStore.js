import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateQuests, levelForXp, xpIntoLevel } from './questEngine';

const STORAGE_KEY = 'vicinitygo:progress';

function loadProgress() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.quests)) return parsed;
  } catch {
    // Corrupt or unavailable storage — start fresh.
  }
  return null;
}

/**
 * Session state: origin, generated quests, and progress.
 * XP is derived, never stored twice: completed quests award their xp live;
 * starting a new run banks the old run's XP so lifetime total survives.
 */
export default function useVicinityStore() {
  const saved = useMemo(loadProgress, []);

  const [origin, setOrigin] = useState(saved?.origin ?? null);
  const [city, setCity] = useState(saved?.city ?? '');
  const [quests, setQuests] = useState(saved?.quests ?? []);
  const [bankedXp, setBankedXp] = useState(saved?.bankedXp ?? 0);

  useEffect(() => {
    // Write while a run is active, and after endRun clears it (so banked XP
    // survives a page close); skip only when there is nothing worth saving.
    if (!origin && bankedXp === 0) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ origin, city, quests, bankedXp })
      );
    } catch {
      // Storage unavailable — progress just won't persist.
    }
  }, [origin, city, quests, bankedXp]);

  const startRun = useCallback(({ origin, city, vibe, duration, seed, quests: precomposed }) => {
    const earned = quests.filter((q) => q.done).reduce((n, q) => n + q.xp, 0);
    if (earned > 0) setBankedXp((b) => b + earned);
    // Precomposed quests (real OSM places) skip the fictional generator.
    setQuests(precomposed ?? generateQuests(origin, { vibe, duration, seed, city }));
    setOrigin(origin);
    setCity(city);
  }, [quests]);

  const completeCheckpoint = useCallback((questId, checkpointId) => {
    setQuests((current) =>
      current.map((q) => {
        if (q.id !== questId) return q;
        const checkpoints = q.checkpoints.map((c) =>
          c.id === checkpointId && !c.done ? { ...c, done: true } : c
        );
        return { ...q, checkpoints, done: checkpoints.every((c) => c.done) };
      })
    );
  }, []);

  const endRun = useCallback(() => {
    // Bank completed XP, then clear the run (used by "New adventure").
    const earned = quests.filter((q) => q.done).reduce((n, q) => n + q.xp, 0);
    if (earned > 0) setBankedXp((b) => b + earned);
    setOrigin(null);
    setQuests([]);
    setCity('');
  }, [quests]);

  const currentRunXp = useMemo(
    () => quests.filter((q) => q.done).reduce((n, q) => n + q.xp, 0),
    [quests]
  );
  const xp = bankedXp + currentRunXp;

  const stats = useMemo(
    () => ({
      xp,
      level: levelForXp(xp),
      intoLevel: xpIntoLevel(xp),
      questsDone: quests.filter((q) => q.done).length,
      questsTotal: quests.length,
    }),
    [xp, quests]
  );

  return { origin, city, quests, stats, startRun, completeCheckpoint, endRun };
}

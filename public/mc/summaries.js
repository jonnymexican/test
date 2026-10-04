/**
 * Mission Control summary helpers — pure, no DOM, unit-testable.
 *
 * Reads nothing: callers hand in ledger/task data (from the bureau-vault
 * worker or this device's localStorage) and get back display-ready numbers.
 *
 * The scoring, rank and streak rules here mirror the source apps so the
 * console agrees with what FriendCredit™ and adhdTracker show:
 *   - scoring/ranks: brocredit/src/ledgerLogic.js
 *   - streaks/expectations: adhdtracker/src/tasksLogic.js
 * Keep them in sync if the apps ever change the rules.
 */

// ---------------- shared date helpers (local time, YYYY-MM-DD) ----------------

export function todayStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return todayStr(date);
}

// ---------------- FriendCredit™ scoring (mirrors ledgerLogic.js) ----------------

export const BASE_SCORE = 700; // every friend starts with the benefit of the doubt
export const MIN_SCORE = 300;
export const MAX_SCORE = 850;

export const RANKS = [
  { id: 'legend', title: 'Legend', emoji: '🐐', min: 800, max: 850 },
  { id: 'good-friend', title: 'Certified Good Friend', emoji: '🏅', min: 740, max: 799 },
  { id: 'solid', title: 'Solid Friend', emoji: '👍', min: 680, max: 739 },
  { id: 'probation', title: 'On Probation', emoji: '📋', min: 620, max: 679 },
  { id: 'flake', title: 'Certified Flake', emoji: '❄️', min: 550, max: 619 },
  { id: 'clown', title: 'Clown Behavior', emoji: '🤡', min: 480, max: 549 },
  { id: 'pariah', title: 'Enemy of the Friend Group', emoji: '🚨', min: MIN_SCORE, max: 479 },
];

export function clampScore(score) {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, score));
}

export function scoreToRank(score) {
  const clamped = clampScore(score);
  return RANKS.find((r) => clamped >= r.min && clamped <= r.max) || RANKS[RANKS.length - 1];
}

/**
 * Score every friend: base score + net transaction deltas, clamped to the
 * official range. Sorted by score descending, ties broken alphabetically.
 */
export function scoreFriends(friends, transactions) {
  return (friends || [])
    .map((friend) => {
      const txns = (transactions || []).filter((t) => t.friendId === friend.id);
      const net = txns.reduce((sum, t) => sum + (Number(t.delta) || 0), 0);
      const score = clampScore(BASE_SCORE + net);
      return {
        friend,
        score,
        rank: scoreToRank(score),
        net,
        awards: txns.filter((t) => t.delta > 0).length,
        penalties: txns.filter((t) => t.delta < 0).length,
      };
    })
    .sort(
      (a, b) => b.score - a.score || String(a.friend.name).localeCompare(String(b.friend.name))
    );
}

// ---------------- adhdTracker stats (mirrors tasksLogic.js) ----------------

/**
 * Streak of consecutive days (ending today or yesterday) with ≥1 completion,
 * plus how often the reflection confirmed the expectation was met.
 */
export function computeAdhdStats(tasks, referenceDay = todayStr()) {
  const done = (tasks || []).filter((t) => t.done);
  const doneDays = new Set(done.map((t) => t.completedOn).filter(Boolean));

  // Today still has time, so an empty today doesn't break yesterday's streak.
  let streak = 0;
  let cursor = doneDays.has(referenceDay) ? referenceDay : addDays(referenceDay, -1);
  while (doneDays.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  const met = done.filter((t) => t.reflection && t.reflection.met === true).length;
  const partially = done.filter((t) => t.reflection && t.reflection.met === 'partial').length;
  const missed = done.filter((t) => t.reflection && t.reflection.met === false).length;
  const reflected = met + partially + missed;

  return {
    streak,
    totalCompleted: done.length,
    met,
    partially,
    missed,
    reflected,
    expectationRate: reflected > 0 ? Math.round((met / reflected) * 100) : null,
  };
}

// ---------------- vault merging (mirrors both apps' sync rules) ----------------

const itemTime = (x) => Number(x.updatedAt ?? x.createdAt ?? 0);

/**
 * Union of local and remote lists by id, newest wins, with tombstones
 * (deletion markers) applied on top — the same rule the apps use so a
 * deletion from any device stays deleted on the console.
 */
export function mergeById(localList, remoteList, tombstones) {
  const byId = new Map();
  for (const item of localList || []) byId.set(item.id, item);
  for (const item of remoteList || []) {
    const current = byId.get(item.id);
    if (!current || itemTime(item) > itemTime(current)) byId.set(item.id, item);
  }
  for (const tb of tombstones || []) {
    const live = byId.get(tb.id);
    if (live && itemTime(live) <= Number(tb.deletedAt || 0)) byId.delete(tb.id);
  }
  return [...byId.values()];
}

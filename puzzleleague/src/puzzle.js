/**
 * Daily Puzzle League — "Crack the Number" engine.
 *
 * Every day gets one deterministic puzzle: four hidden numbers (distinct,
 * 2..9) and a set of clues of the form "▢ + ▢ = 11", "▢ × ▢ = 24",
 * "one of the numbers is 5". The clues are generated FROM the hidden set,
 * then a brute-force solver proves the set is the ONLY one of the 715
 * possible sets that satisfies every clue — so every shipped puzzle is
 * guaranteed fair and solvable. (It's a static app, so the answers ride
 * in the bundle — same honor system as a printed puzzle page.)
 *
 * Everything here is pure: no DOM, no storage, no clock — the caller
 * passes the date. That keeps the generator fully testable.
 */

export const PUZZLE_EPOCH = '2026-09-28'; // day 0 — a Monday, as all things should be
export const VALUES_MIN = 2;
export const VALUES_MAX = 9;

// ---------- seeded randomness ----------

/** FNV-1a-ish string hash → 32-bit unsigned int. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — small, fast, deterministic. Returns () => float in [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher-Yates. Returns a new array; input untouched. */
export function seededShuffle(list, rand) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------- dates ----------

function dateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function dateKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole days since the epoch (negative before it). UTC-based, DST-proof. */
export function dayNumFor(date) {
  const ms = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const epoch = dateFromKey(PUZZLE_EPOCH).getTime();
  return Math.round((ms - epoch) / 86400000);
}

export function dateForDayNum(dayNum) {
  return new Date(dateFromKey(PUZZLE_EPOCH).getTime() + dayNum * 86400000);
}

// ---------- clue semantics ----------
//
// A clue is { op, r } over the hidden SET of numbers (order never matters):
//   has:  one of the numbers is r
//   sum:  two different numbers add up to r
//   diff: two different numbers differ by r (larger minus smaller)
//   prod: two different numbers multiply to r
//   quot: one divided by another (evenly) gives r

export const OP_LABEL = { has: 'One of the numbers is', sum: '▢ + ▢ =', diff: '▢ − ▢ =', prod: '▢ × ▢ =', quot: '▢ ÷ ▢ =' };

function satisfiedBy(set, clue) {
  const { op, r } = clue;
  if (op === 'has') return set.includes(r);
  for (let i = 0; i < set.length; i += 1) {
    for (let j = 0; j < set.length; j += 1) {
      if (i === j) continue;
      const x = set[i];
      const y = set[j];
      if (op === 'sum' && x + y === r && x < y) return true; // count each pair once
      if (op === 'diff' && x - y === r) return true;
      if (op === 'prod' && x * y === r && x < y) return true;
      if (op === 'quot' && x % y === 0 && x / y === r) return true;
    }
  }
  return false;
}

/** All 4-number sets (distinct values in [min..max]) satisfying every clue. */
export function solve(clues, min = VALUES_MIN, max = VALUES_MAX) {
  const sets = [];
  for (let a = min; a <= max; a += 1) {
    for (let b = a + 1; b <= max; b += 1) {
      for (let c = b + 1; c <= max; c += 1) {
        for (let d = c + 1; d <= max; d += 1) {
          const set = [a, b, c, d];
          if (clues.every((clue) => satisfiedBy(set, clue))) sets.push(set);
        }
      }
    }
  }
  return sets;
}

// ---------- generation ----------

const OPS = ['+', '-', '*', '/'];
const SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };

function applyOp(op, x, y) {
  if (op === '+') return x + y;
  if (op === '-') return x - y;
  if (op === '*') return x * y;
  return Number.isInteger(x / y) ? x / y : NaN;
}

/**
 * Builds the hidden solution for one candidate: two shapes —
 *   A: ((a ∘ b) ∘ c) ∘ d   (left-leaning chain)
 *   B: (a ∘ b) ∘ (c ∘ d)   (balanced)
 * Root numbers are distinct values in [2..9]; every intermediate result
 * must be a positive integer ≤ 999 so all arithmetic stays human.
 */
function buildSolution(rand) {
  const pool = seededShuffle([2, 3, 4, 5, 6, 7, 8, 9], rand).slice(0, 4);
  const [a, b, c, d] = pool;
  const shapes = rand() < 0.5 ? ['A', 'B'] : ['B', 'A'];

  for (const shape of shapes) {
    const ops = seededShuffle(OPS, rand);
    for (const o1 of ops) {
      for (const o2 of ops) {
        for (const o3 of ops) {
          let left;
          let right;
          let target;
          if (shape === 'A') {
            const ab = applyOp(o1, a, b);
            const abc = applyOp(o2, ab, c);
            left = ab;
            right = c;
            target = applyOp(o3, abc, d);
            if (!valid(left) || !valid(abc) || !valid(target)) continue;
          } else {
            left = applyOp(o1, a, b);
            right = applyOp(o2, c, d);
            if (!valid(left) || !valid(right)) continue;
            target = applyOp(o3, left, right);
            if (!valid(target)) continue;
          }
          const expr =
            shape === 'A'
              ? `((${a} ${SYM[o1]} ${b}) ${SYM[o2]} ${c}) ${SYM[o3]} ${d}`
              : `(${a} ${SYM[o1]} ${b}) ${SYM[o3]} (${c} ${SYM[o2]} ${d})`;
          return { pool, target, expression: expr };
        }
      }
    }
  }
  return null; // practically unreachable
}

function valid(n) {
  return Number.isInteger(n) && n > 0 && n <= 999;
}

/** Every clue derivable from the hidden set: all pair facts + reveals. */
function allCluesFor(set) {
  const clues = [];
  for (let i = 0; i < set.length; i += 1) {
    clues.push({ op: 'has', r: set[i] });
    for (let j = 0; j < set.length; j += 1) {
      if (i === j) continue;
      const x = set[i];
      const y = set[j];
      if (x < y) {
        clues.push({ op: 'sum', r: x + y });
        clues.push({ op: 'prod', r: x * y });
      }
      if (x > y) {
        clues.push({ op: 'diff', r: x - y });
        if (x % y === 0) clues.push({ op: 'quot', r: x / y });
      }
    }
  }
  return clues;
}

export const MIN_STARTING_CLUES = 2; // shown for free
export const MAX_CLUES = 6; // hard cap; candidates needing more are rejected

/**
 * Generates the puzzle for a day number. Deterministic: the same dayNum
 * always yields the same puzzle. Returns null only if a candidate can't
 * be proven unique within the clue cap (rare; the day-search falls through).
 */
export function generatePuzzle(dayNum) {
  const rand = mulberry32(hashString(`puzzleleague:v1:${dayNum}`));

  for (let candidate = 0; candidate < 40; candidate += 1) {
    const sol = buildSolution(rand);
    if (!sol) continue;
    const { pool, target, expression } = sol;

    const cluePool = seededShuffle(allCluesFor(pool), rand);
    // Seed with one reveal (a toehold) and one pair fact, then add clues
    // until the solver proves the hidden set is the ONLY possible one.
    const startReveal = cluePool.find((c) => c.op === 'has');
    const startPair = cluePool.find((c) => c.op !== 'has');
    const clues = [startReveal, startPair];
    let rest = cluePool.filter((c) => c !== startReveal && c !== startPair);

    while (solve(clues).length !== 1) {
      if (rest.length === 0 || clues.length >= MAX_CLUES) break;
      clues.push(rest.shift());
    }
    if (solve(clues).length !== 1) continue;

    return {
      dayNum,
      clues: clues.map((c, i) => ({ ...c, i })),
      solution: pool,
      expression,
      target,
    };
  }
  return null;
}

const cache = new Map();

/** Memoized daily puzzle. `date` is a Date; UTC day is used. */
export function getPuzzle(date) {
  const dayNum = dayNumFor(date);
  if (!cache.has(dayNum)) cache.set(dayNum, generatePuzzle(dayNum));
  return cache.get(dayNum);
}

// ---------- play ----------

/** A guess is right when it's the same SET of four numbers (order free). */
export function checkGuess(puzzle, guess) {
  const values = guess.map(Number);
  if (values.length !== 4 || values.some((v) => !Number.isInteger(v) || v < 0 || v > 99)) return false;
  const want = [...puzzle.solution].sort((a, b) => a - b).join(',');
  const got = values.sort((a, b) => a - b).join(',');
  return want === got;
}

/**
 * Score: fewer revealed clues and fewer wrong guesses is better.
 * The first MIN_STARTING_CLUES clues are free; streak bonus is applied by
 * the league hook, not here.
 */
export function scoreFor(cluesRevealed, guesses) {
  const base = [120, 95, 75, 60, 50, 40, 30][Math.max(0, Math.min(6, cluesRevealed - MIN_STARTING_CLUES))];
  return Math.max(20, base - 5 * Math.max(0, guesses - 1));
}

/** Consecutive-day streak ending today (or yesterday, if today is unsolved). */
export function computeStreak(solvedDayNums, todayDayNum) {
  const days = new Set(solvedDayNums);
  let cursor = days.has(todayDayNum) ? todayDayNum : todayDayNum - 1;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

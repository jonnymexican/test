import { describe, it, expect } from 'vitest';
import {
  checkGuess,
  computeStreak,
  dateForDayNum,
  dateKey,
  dayNumFor,
  generatePuzzle,
  getPuzzle,
  hashString,
  mulberry32,
  scoreFor,
  seededShuffle,
  solve,
  MIN_STARTING_CLUES,
  MAX_CLUES,
  PUZZLE_EPOCH,
} from './puzzle';

describe('seeded randomness', () => {
  it('hashes deterministically', () => {
    expect(hashString('puzzleleague:v1:0')).toBe(hashString('puzzleleague:v1:0'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('produces a reproducible PRNG stream', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const streamA = [a(), a(), a()];
    const streamB = [b(), b(), b()];
    expect(streamA).toEqual(streamB);
    for (const v of streamA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('shuffles deterministically and keeps every element', () => {
    const rand = mulberry32(7);
    const once = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], rand);
    expect([...once].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('dates', () => {
  it('counts days from the epoch', () => {
    expect(dayNumFor(dateForDayNum(0))).toBe(0);
    expect(dayNumFor(dateForDayNum(1))).toBe(1);
    expect(dayNumFor(dateForDayNum(-1))).toBe(-1);
    expect(dayNumFor(dateForDayNum(1000))).toBe(1000);
  });

  it('survives month and DST boundaries (UTC math only)', () => {
    expect(dateKey(dateForDayNum(2))).toBe('2026-09-30');
    expect(dateKey(dateForDayNum(3))).toBe('2026-10-01');
    expect(dayNumFor(new Date('2026-11-01T23:30:00Z'))).toBe(34); // Oct has 31 days
    // same UTC day regardless of wall-clock hour
    expect(dayNumFor(new Date('2026-09-28T00:00:00Z'))).toBe(dayNumFor(new Date('2026-09-28T23:59:00Z')));
  });

  it('anchors the epoch on the documented date', () => {
    expect(PUZZLE_EPOCH).toBe('2026-09-28');
  });
});

describe('generation', () => {
  it('is deterministic for a given day', () => {
    const a = generatePuzzle(0);
    const b = generatePuzzle(0);
    expect(a).toEqual(b);
  });

  it('differs across days (shape and numbers vary)', () => {
    const p0 = generatePuzzle(0);
    const p1 = generatePuzzle(1);
    const p2 = generatePuzzle(2);
    const keys = [p1, p2].map((p) => p.solution.join(','));
    // At least one of two other days differs from day 0's set.
    expect(new Set([p0.solution.join(','), ...keys]).size).toBeGreaterThan(1);
  });

  it('always emits a valid hidden set and unique clue-proof', () => {
    for (let day = 0; day < 30; day += 1) {
      const p = generatePuzzle(day);
      if (!p) continue; // day-search may skip a rare unprovable candidate
      expect(p.solution).toHaveLength(4);
      const sorted = [...p.solution].sort((a, b) => a - b);
      expect(new Set(sorted).size).toBe(4); // distinct
      expect(sorted[0]).toBeGreaterThanOrEqual(2);
      expect(sorted[3]).toBeLessThanOrEqual(9);
      expect(p.clues.length).toBeLessThanOrEqual(MAX_CLUES);
      expect(p.clues.length).toBeGreaterThanOrEqual(MIN_STARTING_CLUES + 1);
      expect(Number.isInteger(p.target)).toBe(true);
      expect(p.expression).toMatch(/\d [+−×÷] \d/); // it's a real arithmetic expression
      // The shipped clue set admits EXACTLY one set: the hidden one.
      const solutions = solve(p.clues);
      expect(solutions).toHaveLength(1);
      expect(solutions[0]).toEqual(sorted);
    }
  });

  it('getPuzzle memoizes per day', () => {
    const d = new Date();
    expect(getPuzzle(d)).toBe(getPuzzle(d));
  });

  it('never skips a day or ships an ambiguous clue set (first year)', () => {
    // Permanent regression sweep: every day of year one must generate a
    // puzzle whose clues admit exactly the hidden set — nothing else.
    for (let day = 0; day <= 365; day += 1) {
      const p = generatePuzzle(day);
      expect(p, `day ${day} generated no puzzle`).not.toBeNull();
      const solutions = solve(p.clues);
      expect(solutions, `day ${day} is ambiguous (${solutions.length} sets fit)`).toHaveLength(1);
      expect(solutions[0]).toEqual([...p.solution].sort((a, b) => a - b));
    }
  });
});

describe('solver', () => {
  it('rejects sets that break a clue', () => {
    const clues = [{ op: 'has', r: 5 }, { op: 'sum', r: 11 }, { op: 'diff', r: 4 }, { op: 'prod', r: 48 }];
    const sets = solve(clues);
    for (const set of sets) {
      expect(set).toContain(5);
      const pairs = [];
      for (let i = 0; i < set.length; i += 1) {
        for (let j = i + 1; j < set.length; j += 1) pairs.push(set[i] + set[j]);
      }
      expect(pairs).toContain(11);
      const diffs = [];
      for (let i = 0; i < set.length; i += 1) {
        for (let j = i + 1; j < set.length; j += 1) diffs.push(set[j] - set[i]);
      }
      expect(diffs).toContain(4);
    }
  });

  it('handles quot clues', () => {
    const clues = [{ op: 'quot', r: 3 }, { op: 'has', r: 2 }];
    const sets = solve(clues);
    expect(sets.length).toBeGreaterThan(0);
    for (const set of sets) {
      expect(set).toContain(2);
      const quots = [];
      for (const x of set) {
        for (const y of set) {
          if (x !== y && x % y === 0) quots.push(x / y);
        }
      }
      expect(quots).toContain(3);
    }
  });
});

describe('play helpers', () => {
  it('accepts the same set in any order and rejects others', () => {
    const p = generatePuzzle(0);
    expect(checkGuess(p, p.solution)).toBe(true);
    expect(checkGuess(p, [...p.solution].reverse())).toBe(true);
    const wrong = p.solution.map((n) => (n === 9 ? 8 : n + 1));
    expect(checkGuess(p, wrong)).toBe(false);
    expect(checkGuess(p, [2, 3])).toBe(false);
    expect(checkGuess(p, ['a', 2, 3, 4])).toBe(false);
  });

  it('scores fewer clues and fewer guesses higher', () => {
    expect(scoreFor(MIN_STARTING_CLUES, 1)).toBeGreaterThan(scoreFor(MAX_CLUES, 1));
    expect(scoreFor(MIN_STARTING_CLUES, 1)).toBeGreaterThan(scoreFor(MIN_STARTING_CLUES, 5));
    expect(scoreFor(1, 1)).toBeGreaterThan(0);
  });

  it('counts streaks across consecutive solved days', () => {
    expect(computeStreak([5, 4, 3], 5)).toBe(3);
    expect(computeStreak([5, 4, 2], 5)).toBe(2); // gap at 3
    expect(computeStreak([4, 3], 5)).toBe(2); // today unsolved → count up to yesterday
    expect(computeStreak([3], 5)).toBe(0);
    expect(computeStreak([], 5)).toBe(0);
  });
});

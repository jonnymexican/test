import { describe, it, expect } from 'vitest';
import {
  makeChunks,
  openChunks,
  settleChunk,
  TASK_KINDS,
  encodeResult,
  totalWorked,
  DEMO_TASKS,
} from '../public/grid/grid-core.js';

describe('makeChunks', () => {
  it('slices the domain into indexed chunks', () => {
    expect(makeChunks([1], 10, 3)).toEqual([
      { index: 0, start: 0, len: 10 },
      { index: 1, start: 10, len: 10 },
      { index: 2, start: 20, len: 10 },
    ]);
  });
});

describe('openChunks', () => {
  const now = 1_000_000;
  it('offers untouched chunks; parked chunks close only with a live second claim', () => {
    expect(
      openChunks(3, [null, { s: 'p', by: ['other'], cBy: 'third', cAt: now - 1000 }, null], now, 'me')
    ).toEqual([0, 2]);
  });
  it('steals stalled claims but not fresh ones', () => {
    const states = [
      { s: 'c', at: now - 20 * 60 * 1000, by: ['other'] }, // stale → open
      { s: 'c', at: now - 1000, by: ['other'] }, // fresh → closed
      { s: 'c', at: now - 20 * 60 * 1000, by: ['me'] }, // my own claim → closed
    ];
    expect(openChunks(3, states, now, 'me')).toEqual([0]);
  });
  it('never offers settled chunks, but parked chunks await a second cruncher', () => {
    const states = [
      { s: 's' },
      { s: 'p', by: ['other'], h: 'h' }, // parked, no second cruncher yet → open
      { s: 'p', by: ['other'], h: 'h', cBy: 'third', cAt: now - 1000 }, // live second claim → closed
      { s: 'p', by: ['other'], h: 'h', cBy: 'third', cAt: 0 }, // stale second claim → open
      { s: 'p', by: ['me'], h: 'h' }, // my own parked result → closed
      { s: 'c', at: 0, by: [] }, // stale first claim → open
    ];
    expect(openChunks(6, states, now, 'me')).toEqual([1, 3, 5]);
  });
});

describe('settleChunk', () => {
  it('parks the first result', () => {
    const next = settleChunk(null, 'h1', 'n1');
    expect(next.s).toBe('p');
    expect(next.by).toEqual(['n1']);
    expect(next.h).toBe('h1');
  });
  it('settles when the second hash agrees', () => {
    const next = settleChunk({ s: 'p', by: ['n1'], h: 'h1', at: 5, ms: 10 }, 'h1', 'n2');
    expect(next.s).toBe('s');
    expect(next.by).toEqual(['n1', 'n2']);
  });
  it('requeues on disagreement and counts the mismatch', () => {
    const next = settleChunk({ s: 'p', by: ['n1'], h: 'h1', at: 5 }, 'DIFFERENT', 'n2');
    expect(next.s).toBe('c');
    expect(next.by).toEqual([]);
    expect(next.mm).toBe(1);
  });
  it('is idempotent once settled', () => {
    const s = { s: 's', by: ['n1', 'n2'], h: 'h1', at: 5 };
    expect(settleChunk(s, 'h1', 'n3')).toBe(s);
  });
});

describe('TASK_KINDS', () => {
  it('collatz: known stopping times', () => {
    const out = TASK_KINDS.collatz({ index: 0, start: 0, len: 8 }, [1]);
    // 1→0, 2→1, 3→7, 4→2, 5→5, 6→8, 7→16, 8→3
    expect(out).toEqual([0, 1, 7, 2, 5, 8, 16, 3]);
  });
  it('primes: exact census for a known range', () => {
    const out = TASK_KINDS.primes({ index: 0, start: 0, len: 100 }, []);
    expect(out).toEqual([25]); // 25 primes below 100
  });
  it('stats: digit histogram of given data', () => {
    const out = TASK_KINDS.stats({ index: 0, start: 0, len: 10 }, ['3141592653']);
    expect(out).toEqual([0, 2, 1, 2, 1, 2, 1, 0, 0, 1]);
  });
  it('is deterministic across runs', () => {
    const a = TASK_KINDS.collatz({ index: 1, start: 5000, len: 50 }, [1]);
    const b = TASK_KINDS.collatz({ index: 1, start: 5000, len: 50 }, [1]);
    expect(a).toEqual(b);
  });
});

describe('encodeResult + totalWorked', () => {
  it('base64-encodes canonical JSON', () => {
    expect(encodeResult('collatz', [0, 1, 7])).toBe(btoa('[0,1,7]'));
  });
  it('totals the numbers crunched across tasks', () => {
    expect(
      totalWorked([
        { chunksSettled: 3, chunkSize: 5000 },
        { chunksSettled: 1, chunkSize: 10 },
      ])
    ).toBe(15010);
  });
});

describe('DEMO_TASKS', () => {
  it('covers a known-answer domain (primes < 1,000,000)', () => {
    const t = DEMO_TASKS.find((t) => t.id === 'prime-gaps');
    expect(t.chunkSize * t.chunkCount).toBe(1_000_000);
  });
});

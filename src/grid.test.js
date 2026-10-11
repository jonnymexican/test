import { describe, it, expect } from 'vitest';
import {
  makeChunks,
  openChunks,
  settleChunk,
  TASK_KINDS,
  encodeResult,
  decodeResult,
  findStretches,
  verifyPrimeGap,
  isPrimeExact,
  seriesByIndex,
  totalWorked,
  DEMO_TASKS,
} from '../public/grid/grid-core.js';

/**
 * Segmented sieve over [start, start+len) — deliberately a different algorithm
 * from the grid's Miller-Rabin, so agreement between them means something.
 */
function sieve(start, len) {
  const limit = Math.floor(Math.sqrt(start + len)) + 1;
  const small = [];
  const crossed = new Array(limit + 1).fill(false);
  for (let i = 2; i <= limit; i++) {
    if (crossed[i]) continue;
    small.push(i);
    for (let j = i * i; j <= limit; j += i) crossed[j] = true;
  }
  const seg = new Array(len).fill(true);
  for (const p of small) {
    for (let m = Math.max(p * p, Math.ceil(start / p) * p); m < start + len; m += p) seg[m - start] = false;
  }
  const out = [];
  for (let k = 0; k < len; k++) if (seg[k]) out.push(start + k);
  return out;
}

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

describe('isPrimeExact', () => {
  it('is right on the small cases and out on the hunting ground', () => {
    expect([1, 2, 3, 4, 9, 97, 100].map(isPrimeExact)).toEqual([false, true, true, false, false, true, false]);
    expect(isPrimeExact(1_000_000_007)).toBe(true); // a known prime just past the frontier
    expect(isPrimeExact(1_000_000_008)).toBe(false);
  });
});

describe('primegap (the hunt)', () => {
  it('reports the prime count and the deepest stretch inside a known range', () => {
    const r = TASK_KINDS.primegap({ index: 0, start: 0, len: 100 }, []);
    expect(r.count).toBe(25); // 25 primes below 100
    expect(r.first).toBe(2);
    expect(r.last).toBe(97);
    expect({ gap: r.gap, from: r.from, to: r.to }).toEqual({ gap: 8, from: 89, to: 97 });
  });

  it('keeps the wire shape fixed when a chunk holds one prime, or none', () => {
    expect(TASK_KINDS.primegap({ index: 0, start: 10, len: 3 }, [])).toEqual({
      count: 1, first: 11, last: 11, gap: 0, from: 0, to: 0,
    });
    expect(TASK_KINDS.primegap({ index: 0, start: 14, len: 2 }, [])).toEqual({
      count: 0, first: null, last: null, gap: 0, from: 0, to: 0,
    });
  });

  it('is deterministic, and survives the wire encoding — the basis for two nodes agreeing', () => {
    const a = TASK_KINDS.primegap({ index: 3, start: 1_000_000_000, len: 500 }, []);
    const b = TASK_KINDS.primegap({ index: 3, start: 1_000_000_000, len: 500 }, []);
    // …and the task's own offset form (chunk 0 starting at the frontier) matches it.
    expect(TASK_KINDS.primegap({ index: 0, start: 0, len: 500 }, [1_000_000_000])).toEqual(a);
    expect(a).toEqual(b);
    expect(encodeResult('primegap', a)).toBe(encodeResult('primegap', b));
    expect(decodeResult(encodeResult('primegap', a))).toEqual(a);
  });

  it('agrees with an independent sieve on the real hunting ground', () => {
    const start = 1_000_000_000, len = 3000;
    const primes = sieve(start, len);
    // Fed the way the node engine feeds it: chunk 0, the offset in input[0].
    const r = TASK_KINDS.primegap({ index: 0, start: 0, len }, [start]);
    expect(r.count).toBe(primes.length);
    expect(r.first).toBe(primes[0]);
    expect(r.last).toBe(primes[primes.length - 1]);
    let best = { gap: 0, from: 0, to: 0 };
    for (let i = 1; i < primes.length; i++) {
      const d = primes[i] - primes[i - 1];
      if (d > best.gap) best = { gap: d, from: primes[i - 1], to: primes[i] };
    }
    expect({ gap: r.gap, from: r.from, to: r.to }).toEqual(best);
  });
});

describe('findStretches (stitching settled chunks into the fleet’s map)', () => {
  const rec = (count, first, last, gap, from, to) => ({ count, first, last, gap, from, to });

  it('finds the true deepest gap across real chunks of the frontier', () => {
    // Mirrors the node engine exactly: chunks are numbered from zero, and the
    // task's input carries where the surveyed territory starts.
    const task = DEMO_TASKS.find((t) => t.id === 'dry-stretches');
    const start = task.input[0], size = 5000, count = 4;
    const by = {};
    for (let i = 0; i < count; i++) {
      by[i] = TASK_KINDS.primegap({ index: i, start: i * size, len: size }, task.input);
    }
    const stitched = findStretches(by)[0];
    const primes = sieve(start, size * count);
    let truth = { gap: 0, from: 0, to: 0 };
    for (let i = 1; i < primes.length; i++) {
      const d = primes[i] - primes[i - 1];
      if (d > truth.gap) truth = { gap: d, from: primes[i - 1], to: primes[i] };
    }
    expect({ gap: stitched.gap, from: stitched.from, to: stitched.to }).toEqual(truth);
  });

  it('joins neighbouring chunks across the border they share', () => {
    // Real territory [0, 30) in chunks of 10: 7→11 and 19→23 only exist
    // because two chunks agreed; 23→29 is inside one chunk.
    const by = {};
    for (let i = 0; i < 3; i++) by[i] = TASK_KINDS.primegap({ index: i, start: i * 10, len: 10 }, []);
    const full = findStretches(by);
    expect(full[0]).toEqual({ gap: 6, from: 23, to: 29, chunkIndex: 2, across: false });
    expect(full).toContainEqual({ gap: 4, from: 7, to: 11, chunkIndex: 1, across: true });
    expect(full).toContainEqual({ gap: 4, from: 19, to: 23, chunkIndex: 2, across: true });

    // With the last chunk missing, the best is now a stitch: 7→11 (ties with
    // 13→17, broken by position).
    delete by[2];
    const two = findStretches(by);
    expect(two[0]).toEqual({ gap: 4, from: 7, to: 11, chunkIndex: 1, across: true });
  });

  it('carries the last prime across a chunk that holds none', () => {
    // Real territory [80, 101): chunk 0 holds 83 and 89, chunk 1 is a stretch
    // with no primes at all (90–95), chunk 2 opens on 97. The 8-wide stretch
    // only becomes visible by carrying 89 across the empty chunk.
    const by = {
      0: rec(2, 83, 89, 6, 83, 89),
      1: rec(0, null, null, 0, 0, 0),
      2: rec(1, 97, 97, 0, 0, 0),
    };
    expect(findStretches(by)[0]).toEqual({ gap: 8, from: 89, to: 97, chunkIndex: 2, across: true });
  });

  it('refuses to invent a stretch across a chunk nobody has confirmed', () => {
    const by = { 0: rec(2, 89, 97, 8, 89, 97), 2: rec(1, 101, 101, 0, 0, 0) };
    const gaps = findStretches(by);
    expect(gaps).toEqual([{ gap: 8, from: 89, to: 97, chunkIndex: 0, across: false }]);
  });

  it('tolerates an empty map', () => {
    expect(findStretches({})).toEqual([]);
    expect(findStretches(undefined)).toEqual([]);
  });
});

describe('seriesByIndex (a rolling frontier is one map)', () => {
  const size = 100;
  const rec = (count, first, last, gap, from, to) => ({ count, first, last, gap, from, to });

  it('lifts each block’s local chunks into one global index', () => {
    const map = seriesByIndex(1_000, size, [
      { from: 1_000, results: { 0: rec(1, 2, 2, 0, 0, 0), 1: rec(1, 3, 3, 0, 0, 0) } },
      { from: 1_200, results: { 0: rec(1, 5, 5, 0, 0, 0) } },
    ]);
    expect(Object.keys(map)).toEqual(['0', '1', '2']);
    expect(map[2].first).toBe(5); // the next block's chunk 0 became global chunk 2
  });

  it('lets a stretch be stitched across a block border', () => {
    // Block one holds 83 and 89, then runs out of primes; block two opens on 97.
    // The widest stretch in the whole map (89 → 97) is only visible once the
    // two blocks are joined and the prime-less chunk between them is carried.
    const map = seriesByIndex(0, size, [
      { from: 0, results: { 0: rec(2, 83, 89, 6, 83, 89), 1: rec(0, null, null, 0, 0, 0) } },
      { from: 200, results: { 0: rec(1, 97, 97, 0, 0, 0) } },
    ]);
    expect(findStretches(map)[0]).toEqual({ gap: 8, from: 89, to: 97, chunkIndex: 2, across: true });
  });

  it('does not stitch blocks that do not actually tile', () => {
    const map = seriesByIndex(0, size, [
      { from: 0, results: { 0: rec(1, 97, 97, 0, 0, 0) } },
      { from: 500, results: { 0: rec(1, 101, 101, 0, 0, 0) } }, // a gap in the map
    ]);
    const gaps = findStretches(map);
    expect(gaps.some((s) => s.across)).toBe(false);
  });
});

describe('verifyPrimeGap (the receipt)', () => {
  it('accepts a real stretch and says how much it checked', () => {
    const v = verifyPrimeGap(89, 97);
    expect(v).toMatchObject({ ok: true, reason: null, checked: 7 }); // 90..96
    expect(v.ms).toBeGreaterThanOrEqual(0);
  });

  it('rejects a stretch with a prime hidden inside it', () => {
    expect(verifyPrimeGap(89, 101)).toMatchObject({ ok: false, reason: 'prime_inside_the_stretch' });
  });

  it('rejects bad endpoints, non-gaps and junk', () => {
    expect(verifyPrimeGap(90, 97)).toMatchObject({ ok: false, reason: 'from_is_not_prime' });
    expect(verifyPrimeGap(89, 98)).toMatchObject({ ok: false, reason: 'to_is_not_prime' });
    expect(verifyPrimeGap(89, 90)).toMatchObject({ ok: false, reason: 'not_a_gap' });
    expect(verifyPrimeGap(1.5, 97)).toMatchObject({ ok: false, reason: 'not_integers' });
  });

  it('refuses a stretch too big to check in a page rather than freezing on it', () => {
    expect(verifyPrimeGap(2, 2000002)).toMatchObject({ ok: false, reason: 'too_big_to_check_here' });
  });

  it('verifies a stretch the hunt actually found', () => {
    const r = TASK_KINDS.primegap({ index: 0, start: 0, len: 5000 }, [1_000_000_000]);
    expect(r.gap).toBeGreaterThan(0);
    const v = verifyPrimeGap(r.from, r.to);
    expect(v.ok).toBe(true);
    expect(v.checked).toBe(r.gap - 1);
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

/**
 * What stops a task being published at all: the Worker's admin validation on
 * one side, the nodes' kind vocabulary on the other. Returns field names.
 */
function problemsWith(t) {
  const bad = [];
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(t.id)) bad.push('id');
  if (typeof TASK_KINDS[t.kind] !== 'function') bad.push('kind');
  if (t.title.length > 80) bad.push('title');
  if (t.description.length > 500) bad.push('description');
  if (!(t.chunkCount >= 1 && t.chunkCount <= 4096)) bad.push('chunkCount');
  if (!(t.chunkSize >= 1 && t.chunkSize <= 65536)) bad.push('chunkSize');
  if (!Array.isArray(t.input) || JSON.stringify(t.input).length >= 262144) bad.push('input');
  if (t.series !== undefined && !/^[a-z0-9][a-z0-9-]{0,30}$/.test(t.series)) bad.push('series');
  return bad;
}

describe('DEMO_TASKS', () => {
  it('covers a known-answer domain (primes < 1,000,000)', () => {
    const t = DEMO_TASKS.find((t) => t.id === 'prime-gaps');
    expect(t.chunkSize * t.chunkCount).toBe(1_000_000);
  });

  // The publisher now imports DEMO_TASKS, so this is the single place the
  // publisher, the Worker's admin validation and the nodes' kind vocabulary
  // have to agree. (Publishing once drifted from the nodes — the survey went
  // out with no territory offset — and nothing caught it until the manifest was
  // read back from the live vault.)
  it('offers the Worker only tasks the nodes can actually run', () => {
    for (const t of DEMO_TASKS) expect(problemsWith(t), t.id).toEqual([]);
  });

  it('would reject a task the Worker or the nodes could not take', () => {
    const good = DEMO_TASKS[0];
    expect(problemsWith({ ...good, kind: 'mystery' })).toContain('kind');
    expect(problemsWith({ ...good, id: 'Not A Valid Id' })).toContain('id');
    expect(problemsWith({ ...good, chunkSize: 70000 })).toContain('chunkSize');
    expect(problemsWith({ ...good, chunkCount: 0 })).toContain('chunkCount');
    expect(problemsWith({ ...good, input: 'nope' })).toContain('input');
    expect(problemsWith({ ...good, series: 'Not A Series' })).toContain('series');
  });

  it('ships a hunt this page can run, sized to the free tier’s daily budget', () => {
    const t = DEMO_TASKS.find((x) => x.id === 'dry-stretches');
    expect(t.kind).toBe('primegap');
    expect(t.series).toBe('dry-stretches'); // opts into the rolling frontier
    expect(t.input[0]).toBe(1_000_000_000); // and starts at the frontier, not at zero
    expect(TASK_KINDS[t.kind]).toBeTypeOf('function');
    expect(t.chunkSize * t.chunkCount).toBe(5_000_000);
    // Every chunk is crunched twice; KV's free tier fits ~250 settles/day.
    expect(t.chunkCount * 2).toBeLessThanOrEqual(250);
  });
});

/**
 * FleetGrid core — pure logic for the donated-compute grid, shared by the
 * donor node and the test suite. The Worker enforces the same rules
 * server-side; these helpers let nodes behave identically and let tests
 * pin the protocol down. No DOM, no fetch.
 */

/** Slice [start, start+len) into chunk records the node can crunch. */
export function makeChunks(input, chunkSize, chunkCount) {
  var chunks = [];
  for (var i = 0; i < chunkCount; i++) {
    chunks.push({ index: i, start: i * chunkSize, len: chunkSize });
  }
  return chunks;
}

/**
 * Which chunks could this node work on right now?
 * Mirrors the Worker: untouched chunks, stalled first claims, and parked
 * chunks (one result waiting for a second opinion) with no live second
 * cruncher. `now` and `myNode` are injectable for tests.
 */
export var CLAIM_TTL_MS = 10 * 60 * 1000;

export function openChunks(chunkCount, states, now, myNode) {
  var open = [];
  for (var i = 0; i < chunkCount; i++) {
    var e = states[i];
    if (!e) { open.push(i); continue; }
    var mine = e.by && e.by[0] === myNode;
    if (e.s === 'c' && now - e.at > CLAIM_TTL_MS && !mine) open.push(i);
    else if (e.s === 'p' && !mine && (!e.cBy || now - e.cAt > CLAIM_TTL_MS || e.cBy === myNode)) open.push(i);
  }
  return open;
}

/**
 * The settle rule — the heart of the anti-cheat design:
 *   two hashes agree            → chunk settles, both nodes earn
 *   two hashes disagree         → requeue for a fresh pair, mismatch count grows
 *   only one result so far      → parked, waiting for a second opinion
 * Returns the new chunk state (mutates nothing).
 */
export function settleChunk(existing, incomingHash, nodeId) {
  if (existing && existing.s === 's') return existing;
  if (existing && existing.h) {
    if (existing.h === incomingHash) {
      return { s: 's', by: existing.by.concat(nodeId), at: existing.at, h: existing.h, ms: existing.ms };
    }
    return { s: 'c', by: [], at: 0, mm: (existing.mm || 0) + 1 };
  }
  return { s: 'p', by: [nodeId], at: Date.now(), h: incomingHash, ms: 0 };
}

/**
 * Exact primality, deterministic for every value a Number holds exactly.
 * Trial division by the small primes, then Miller-Rabin over the standard
 * deterministic base set — same bases, same verdict, on every machine, which
 * is exactly what lets two nodes agree byte-for-byte on a result.
 */
export function isPrimeExact(n) {
  if (n < 2) return false;
  for (var p of [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]) {
    if (n % p === 0) return n === p;
  }
  var d = n - 1, r = 0;
  while (d % 2 === 0) { d /= 2; r++; }
  for (var a of [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]) {
    var x = 1n, base = BigInt(a), e = BigInt(d), m = BigInt(n);
    while (e > 0n) {
      if (e & 1n) x = (x * base) % m;
      base = (base * base) % m;
      e >>= 1n;
    }
    if (x === 1n || x === m - 1n) continue;
    var ok = false;
    for (var i = 1; i < r; i++) {
      x = (x * x) % m;
      if (x === m - 1n) { ok = true; break; }
    }
    if (!ok) return false;
  }
  return true;
}

/**
 * Task kinds — the vetted task vocabulary. Everything is deterministic:
 * same chunk, same bytes, on every machine, forever.
 *
 *  collatz  — step counts for a run of starting values
 *  primes   — count of primes in [start, start+len) (Miller-Rabin, exact)
 *  stats    — byte histogram of a decimal-text expansion of π (given data)
 *  primegap — the hunt: prime count plus the deepest run of composites
 *             between two primes *inside* the chunk (borders are stitched
 *             from neighbouring chunks — see findStretches)
 */
export var TASK_KINDS = {
  collatz: function (chunk, input) {
    var out = [];
    for (var k = 0; k < chunk.len; k++) {
      var n = (input[0] || 1) + chunk.start + k;
      var steps = 0;
      while (n !== 1) {
        n = n % 2 === 0 ? n / 2 : 3 * n + 1;
        steps++;
      }
      out.push(steps);
    }
    return out;
  },

  primes: function (chunk) {
    var count = 0;
    for (var k = 0; k < chunk.len; k++) if (isPrimeExact(chunk.start + k)) count++;
    return [count];
  },

  /**
   * The hunt. A chunk reports its prime count plus the deepest run of
   * composites between two consecutive primes *with both ends inside the
   * chunk*; gaps that straddle a border are stitched from the neighbouring
   * chunks' first/last primes, so the fleet's record is only ever as good as
   * the chunks that actually agreed. `gap` stays 0 (never null) when a chunk
   * holds fewer than two primes, so the wire shape never varies between nodes.
   */
  primegap: function (chunk, input) {
    // Chunks are always numbered from zero, so the surveyed territory starts
    // at input[0] the same way collatz's run starts at input[0]. Results carry
    // absolute values, which is what makes a finding checkable by a stranger.
    var base = (input && input[0]) || 0;
    var count = 0, first = null, last = null, gap = 0, from = 0, to = 0;
    for (var k = 0; k < chunk.len; k++) {
      var n = base + chunk.start + k;
      if (!isPrimeExact(n)) continue;
      if (last !== null) {
        var d = n - last;
        if (d > gap) { gap = d; from = last; to = n; }
      } else {
        first = n;
      }
      count++;
      last = n;
    }
    return { count: count, first: first, last: last, gap: gap, from: from, to: to };
  },

  stats: function (chunk, input) {
    // Histogram of digits in a slice of provided data (e.g. π's decimals).
    var hist = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var data = input[0] || '';
    for (var k = 0; k < chunk.len; k++) {
      var c = data.charCodeAt(chunk.start + k) - 48;
      if (c >= 0 && c <= 9) hist[c]++;
    }
    return hist;
  },
};

/** Canonical bytes for a kind's result → base64 (what goes on the wire). */
export function encodeResult(kind, result) {
  return btoa(JSON.stringify(result));
}

/** SHA-256 of the canonical result bytes — the agreement fingerprint. */
export async function resultHash(kind, result) {
  var bytes = new TextEncoder().encode(JSON.stringify(result));
  var d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Estimated total numbers crunched, for the dashboard's odometer. */
export function totalWorked(tasks) {
  return (tasks || []).reduce(function (a, t) { return a + (t.chunksSettled || 0) * t.chunkSize; }, 0);
}

// ---------- the hunt: turning settled chunks into the fleet's findings ----------

/** Inverse of encodeResult — what the results route hands back for a chunk. */
export function decodeResult(b64) {
  return JSON.parse(atob(b64));
}

/**
 * Stitch settled chunk results into the fleet's deepest stretches.
 *
 * `byIndex` maps chunk index → that chunk's settled `primegap` result. Only
 * neighbouring settled chunks can be joined: a chunk nobody has confirmed is a
 * hole in the map, and any gap reaching across it is simply unknowable — the
 * walk forgets the last prime it saw whenever it steps over a hole, rather
 * than inventing a stretch the evidence does not support. Returns candidates
 * deepest-first (ties by position), each flagged `across` when it only exists
 * because two chunks agreed.
 */
export function findStretches(byIndex) {
  var indices = Object.keys(byIndex || {}).map(Number).sort(function (a, b) { return a - b; });
  var gaps = [];
  var prevPrime = null;
  var expected = indices.length ? indices[0] : -1; // the first settled chunk starts a run
  indices.forEach(function (i, n) {
    var r = byIndex[i];
    if (n > 0 && i !== expected) prevPrime = null;
    if (r) {
      if (r.gap > 0) gaps.push({ gap: r.gap, from: r.from, to: r.to, chunkIndex: i, across: false });
      if (prevPrime !== null && typeof r.first === 'number') {
        gaps.push({ gap: r.first - prevPrime, from: prevPrime, to: r.first, chunkIndex: i, across: true });
      }
      // An empty chunk carries the earlier prime forward — the stretch runs on.
      if (typeof r.last === 'number') prevPrime = r.last;
    } else {
      prevPrime = null;
    }
    expected = i + 1;
  });
  gaps.sort(function (a, b) { return b.gap - a.gap || a.from - b.from; });
  return gaps;
}

/**
 * The map, block by block. A hunt series tiles forward, so each block's local
 * chunk index has to be lifted into one global index before the stretches can
 * be stitched — otherwise the border between two blocks would look like a hole
 * and the deepest stretch could hide in it. `parts` is [{ from, results }],
 * where `from` is that block's territory start.
 */
export function seriesByIndex(baseFrom, chunkSize, parts) {
  var out = {};
  (parts || []).forEach(function (part) {
    if (!chunkSize) return;
    var offset = Math.round((part.from - baseFrom) / chunkSize);
    Object.keys(part.results || {}).forEach(function (i) {
      out[offset + Number(i)] = part.results[i];
    });
  });
  return out;
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Re-check a claimed stretch from scratch: both ends prime, every integer
 * between them composite, nothing else. This is the whole receipt — a
 * stranger can run it in milliseconds and has to trust nobody, least of all
 * the fleet's own Worker.
 */
export function verifyPrimeGap(from, to) {
  var t0 = nowMs();
  var done = function (ok, reason, checked) {
    return { ok: ok, reason: reason, checked: checked, ms: Math.round((nowMs() - t0) * 100) / 100 };
  };
  if (!Number.isInteger(from) || !Number.isInteger(to)) return done(false, 'not_integers', 0);
  if (to - from < 2) return done(false, 'not_a_gap', 0);
  if (to - from > 1000000) return done(false, 'too_big_to_check_here', 0);
  if (!isPrimeExact(from)) return done(false, 'from_is_not_prime', 0);
  if (!isPrimeExact(to)) return done(false, 'to_is_not_prime', 0);
  var checked = 0;
  for (var n = from + 1; n < to; n++) {
    checked++;
    if (isPrimeExact(n)) return done(false, 'prime_inside_the_stretch', checked);
  }
  return done(true, null, checked);
}

// ---------- demo tasks (the first cause the grid works on) ----------

export var DEMO_TASKS = [
  {
    id: 'collatz-survey',
    title: 'Collatz terrain survey',
    kind: 'collatz',
    description:
      'Map the stopping time of every starting value in [1, 1,000,000). Plain arithmetic — the grid’s proving ground, and oddly beautiful terrain.',
    chunkSize: 5000,
    chunkCount: 200,
    input: [1],
  },
  {
    id: 'prime-gaps',
    title: 'Prime census: the first million',
    kind: 'primes',
    description:
      'Count the primes in [0, 1,000,000) exactly. The answer (78,498) is known — which makes this the perfect integrity test: every node must agree with history.',
    chunkSize: 5000,
    chunkCount: 200,
    input: [],
  },
  {
    id: 'dry-stretches',
    title: 'The dry stretches — a prime gap survey',
    kind: 'primegap',
    description:
      'Walk the integers from 1,000,000,000 and measure every run of composites between consecutive primes. Each chunk reports its prime count and its deepest internal gap; the fleet’s answer is stitched across chunk borders, and any finding re-verifies from scratch in milliseconds.',
    chunkSize: 50000,
    chunkCount: 100,
    input: [1000000000],
    // A rolling frontier: when this block settles, the Worker publishes the
    // next one starting where this one ended, same kind and geometry.
    series: 'dry-stretches',
  },
];

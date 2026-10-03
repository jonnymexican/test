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
 * Task kinds — the vetted task vocabulary. Everything is deterministic:
 * same chunk, same bytes, on every machine, forever.
 *
 *  collatz  — step counts for a run of starting values
 *  primes   — count of primes in [start, start+len) (Miller-Rabin, exact)
 *  stats    — byte histogram of a decimal-text expansion of π (given data)
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
    // Exact Miller-Rabin for 64-bit-ish values (deterministic bases).
    function isPrime(n) {
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
    var count = 0;
    for (var k = 0; k < chunk.len; k++) if (isPrime(chunk.start + k)) count++;
    return [count];
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
];

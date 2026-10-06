/**
 * The Gallery — upload queue with retry, backoff and offline pauses.
 *
 * The browser uploader sends one release photo at a time through the
 * bureau-vault worker; a flaky phone connection or a GitHub hiccup used to
 * kill the whole batch and lose track of what had already gone up. This
 * module owns the "keep trying, in order, and pause while offline" policy
 * as pure functions with injected clock/IO, so src/uploadqueue.test.js can
 * drive it without timers or a network.
 *
 * Error contract for `upload(item, index)`:
 *   - throws with no `.status`            → network failure, retryable
 *   - throws with `.status` 429 or ≥ 500  → transient server trouble, retryable
 *   - throws with any other `.status`     → permanent (bad key, bad name…), give up
 */

export var DEFAULT_ATTEMPTS = 4; // total tries per item
export var BASE_MS = 700; // first retry waits ~700ms
export var MAX_MS = 8000; // …capped at 8s

/**
 * Is this failure worth another attempt?
 * No `.status` means fetch itself blew up (offline, DNS, reset) → yes.
 */
export function isRetryable(err) {
  if (!err) return false;
  var status = err.status;
  if (status == null) return true;
  return status === 429 || status >= 500;
}

/**
 * Exponential backoff for retry number `retryIndex` (0 = first retry):
 * 700ms → 1400 → 2800 → … capped at 8s, with "full jitter"
 * (delay/2 + random·delay/2) so a crowd of queued photos doesn't retry in
 * lockstep. Pass `random` for deterministic tests.
 */
export function backoffMs(retryIndex, opts) {
  opts = opts || {};
  var base = opts.baseMs == null ? BASE_MS : opts.baseMs;
  var max = opts.maxMs == null ? MAX_MS : opts.maxMs;
  var random = opts.random || Math.random;
  var raw = Math.min(max, base * Math.pow(2, Math.max(0, retryIndex | 0)));
  return Math.round(raw / 2 + random() * (raw / 2));
}

/**
 * Await "online" once: resolves immediately when the browser claims it is
 * online, otherwise on the next `online` event. `win` injectable for tests.
 */
export function onlineAwaiter(win) {
  var w = win || (typeof window !== 'undefined' ? window : null);
  return function () {
    if (!w || !w.navigator || w.navigator.onLine !== false) return Promise.resolve();
    return new Promise(function (resolve) {
      function on() {
        w.removeEventListener('online', on);
        resolve();
      }
      w.addEventListener('online', on);
    });
  };
}

/**
 * Upload `items` in order, retrying each per the rules above.
 *
 * Options (all optional):
 *   attempts     total tries per item        (default 4)
 *   baseMs/maxMs backoff shape               (default 700/8000)
 *   random       jitter source               (default Math.random)
 *   sleep        delay fn                    (default setTimeout)
 *   isOnline     () => bool                  (default: always online)
 *   awaitOnline  () => Promise                (default: resolve now)
 *   onRetry      ({ item, index, attempt, delay, error }) — before sleeping
 *   onProgress   ({ done, failed, total, item, error }) — after each item
 *
 * Resolves { done, failed } — `failed` keeps `{ item, error }` in item order
 * so the caller can offer a retry with exactly the pictures still missing.
 */
export async function runQueue(items, upload, opts) {
  opts = opts || {};
  var list = items || [];
  var attempts = opts.attempts == null ? DEFAULT_ATTEMPTS : opts.attempts;
  var sleep = opts.sleep || function (ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  };
  var isOnline = opts.isOnline || function () {
    return true;
  };
  var awaitOnline = opts.awaitOnline || function () {
    return Promise.resolve();
  };
  var done = [];
  var failed = [];

  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    var err = null;
    var tries = 0;
    for (;;) {
      if (!isOnline()) await awaitOnline();
      tries++;
      try {
        await upload(item, i);
        err = null;
        break;
      } catch (e) {
        err = e;
        if (!isRetryable(e) || tries >= attempts) break;
        var delay = backoffMs(tries - 1, opts);
        if (opts.onRetry) {
          opts.onRetry({ item: item, index: i, attempt: tries, delay: delay, error: e });
        }
        await sleep(delay);
      }
    }
    if (err) failed.push({ item: item, error: err });
    else done.push(item);
    if (opts.onProgress) {
      opts.onProgress({
        done: done.length,
        failed: failed.length,
        total: list.length,
        item: item,
        error: err,
      });
    }
  }

  return { done: done, failed: failed };
}

import { describe, it, expect, vi } from 'vitest';
import {
  isRetryable,
  backoffMs,
  onlineAwaiter,
  runQueue,
  DEFAULT_ATTEMPTS,
} from '../public/gallery/uploadqueue.js';

const netErr = () => new Error('Failed to fetch');
const httpErr = (status) => Object.assign(new Error('HTTP ' + status), { status });

describe('isRetryable', () => {
  it('retries network failures (no status)', () => {
    expect(isRetryable(netErr())).toBe(true);
  });

  it('retries 429 and 5xx', () => {
    expect(isRetryable(httpErr(429))).toBe(true);
    expect(isRetryable(httpErr(500))).toBe(true);
    expect(isRetryable(httpErr(503))).toBe(true);
  });

  it('gives up on other 4xx (bad key, bad name…)', () => {
    expect(isRetryable(httpErr(403))).toBe(false);
    expect(isRetryable(httpErr(404))).toBe(false);
    expect(isRetryable(httpErr(422))).toBe(false);
  });

  it('has no opinion on a missing error', () => {
    expect(isRetryable(null)).toBe(false);
  });
});

describe('backoffMs', () => {
  it('doubles each retry from the base delay', () => {
    expect(backoffMs(0, { random: () => 1 })).toBe(700);
    expect(backoffMs(1, { random: () => 1 })).toBe(1400);
    expect(backoffMs(2, { random: () => 1 })).toBe(2800);
    expect(backoffMs(3, { random: () => 1 })).toBe(5600);
  });

  it('caps at maxMs however many retries pile up', () => {
    expect(backoffMs(9, { random: () => 1 })).toBe(8000);
    expect(backoffMs(9, { random: () => 1, maxMs: 2000 })).toBe(2000);
  });

  it('jitters between half and full delay', () => {
    expect(backoffMs(0, { random: () => 0 })).toBe(350);
    expect(backoffMs(0, { random: () => 0.5 })).toBe(525);
  });
});

describe('onlineAwaiter', () => {
  function fakeWin(onLine) {
    const listeners = {};
    return {
      navigator: { onLine },
      addEventListener(ev, fn) {
        (listeners[ev] ||= []).push(fn);
      },
      removeEventListener(ev, fn) {
        listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn);
      },
      goOnline() {
        this.navigator.onLine = true;
        (listeners.online || []).slice().forEach((f) => f());
      },
    };
  }

  it('resolves immediately when online', async () => {
    await expect(onlineAwaiter(fakeWin(true))()).resolves.toBeUndefined();
  });

  it('waits for the online event, then resolves once', async () => {
    const win = fakeWin(false);
    let resolved = false;
    const p = onlineAwaiter(win)().then(() => (resolved = true));
    await Promise.resolve();
    expect(resolved).toBe(false);
    win.goOnline();
    await p;
    expect(resolved).toBe(true);
  });

  it('resolves anyway when there is no window (node/tests)', async () => {
    await expect(onlineAwaiter(null)()).resolves.toBeUndefined();
  });
});

describe('runQueue', () => {
  const noSleep = () => Promise.resolve();

  it('uploads everything in order and reports progress', async () => {
    const seen = [];
    const progress = [];
    const items = ['a.jpg', 'b.jpg', 'c.jpg'];
    const result = await runQueue(
      items,
      async (item, i) => {
        seen.push([item, i]);
      },
      { sleep: noSleep, onProgress: (p) => progress.push([p.done, p.total, p.error]) }
    );
    expect(seen).toEqual([
      ['a.jpg', 0],
      ['b.jpg', 1],
      ['c.jpg', 2],
    ]);
    expect(result.done).toEqual(items);
    expect(result.failed).toEqual([]);
    expect(progress).toEqual([
      [1, 3, null],
      [2, 3, null],
      [3, 3, null],
    ]);
  });

  it('retries transient failures until they pass', async () => {
    let calls = 0;
    const delays = [];
    const result = await runQueue(
      ['p.jpg'],
      async () => {
        calls++;
        if (calls < 3) throw netErr();
      },
      { sleep: async (ms) => delays.push(ms), random: () => 1 }
    );
    expect(result.done).toEqual(['p.jpg']);
    expect(result.failed).toEqual([]);
    expect(calls).toBe(3);
    expect(delays).toEqual([700, 1400]);
  });

  it('stops after the attempt budget and keeps the failure', async () => {
    let calls = 0;
    const retries = [];
    const result = await runQueue(
      ['p.jpg'],
      async () => {
        calls++;
        throw netErr();
      },
      {
        sleep: noSleep,
        attempts: 3,
        onRetry: (info) => retries.push(info.attempt),
      }
    );
    expect(calls).toBe(3);
    expect(retries).toEqual([1, 2]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].item).toBe('p.jpg');
    expect(result.failed[0].error.message).toBe('Failed to fetch');
  });

  it('does not retry permanent 4xx failures', async () => {
    let calls = 0;
    const result = await runQueue(
      ['p.jpg'],
      async () => {
        calls++;
        throw httpErr(403);
      },
      { sleep: noSleep }
    );
    expect(calls).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error.status).toBe(403);
  });

  it('keeps going after a failure — one bad photo never blocks the rest', async () => {
    const result = await runQueue(
      ['a.jpg', 'b.jpg', 'c.jpg'],
      async (item) => {
        if (item === 'b.jpg') throw httpErr(422);
      },
      { sleep: noSleep }
    );
    expect(result.done).toEqual(['a.jpg', 'c.jpg']);
    expect(result.failed.map((f) => f.item)).toEqual(['b.jpg']);
  });

  it('pauses while offline and resumes via awaitOnline', async () => {
    let online = false;
    const uploaded = [];
    const waits = [];
    const result = await runQueue(
      ['a.jpg', 'b.jpg'],
      async (item) => {
        uploaded.push(item);
      },
      {
        sleep: noSleep,
        isOnline: () => online,
        awaitOnline: async () => {
          waits.push(true);
          online = true; // the "online" event fired
        },
      }
    );
    expect(waits).toHaveLength(1); // paused once, then stayed online
    expect(online).toBe(true);
    expect(result.done).toEqual(['a.jpg', 'b.jpg']);
    expect(uploaded).toEqual(['a.jpg', 'b.jpg']);
  });

  it('defaults to four attempts', () => {
    expect(DEFAULT_ATTEMPTS).toBe(4);
  });

  it('handles an empty queue', async () => {
    const upload = vi.fn();
    const result = await runQueue([], upload, { sleep: noSleep });
    expect(upload).not.toHaveBeenCalled();
    expect(result).toEqual({ done: [], failed: [] });
  });
});

// @vitest-environment node
/**
 * The rolling frontier, exercised through the Worker's real fetch handler with
 * an in-memory KV: publish a series, settle its block the way two donor nodes
 * do, and watch the next territory get published on its own.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../bureau-vault/worker.js';

/** The KV surface the Worker actually uses, and nothing more. */
class FakeKV {
  constructor() {
    this.map = new Map();
  }
  async get(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  async put(key, value) {
    this.map.set(key, value);
  }
  async delete(key) {
    this.map.delete(key);
  }
  async list(opts = {}) {
    const prefix = opts.prefix || '';
    const keys = [...this.map.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort()
      .map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

const ADMIN = 'test-admin-key';
let env;

const call = async (path, opts = {}) => {
  const res = await worker.fetch(new Request('https://vault.test' + path, opts), env);
  const text = await res.text();
  let body = text;
  try {
    body = JSON.parse(text);
  } catch (e) {
    /* leave the raw text */
  }
  return { status: res.status, body };
};
const jsonReq = (method, body, headers = {}) => ({
  method,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const adminPut = (task) => call('/fg/admin/tasks', jsonReq('PUT', task, { 'x-admin-key': ADMIN }));
const enlist = async (name) => (await call('/fg/register', jsonReq('POST', { name }))).body;
const as = (n) => ({ 'content-type': 'application/json', 'x-fg-node': n.nodeId, 'x-fg-key': n.nodeKey });
const advanced = async () => (await call('/fg/hunt/advance', { method: 'POST' })).body.advanced;

/** Settle one chunk the way two independent nodes do. */
async function settle(taskId, index, a, b) {
  const resultB64 = Buffer.from(JSON.stringify({ count: index, first: index, last: index, gap: 2, from: 1, to: 3 })).toString('base64');
  const body = JSON.stringify({ taskId, chunkIndex: index, resultB64, ms: 7 });
  await call('/fg/submit', { method: 'POST', headers: as(a), body });
  return (await call('/fg/submit', { method: 'POST', headers: as(b), body })).body;
}

const TINY = {
  id: 'tiny-hunt',
  title: 'Tiny hunt',
  kind: 'primegap',
  description: 'a test block',
  chunkSize: 10,
  chunkCount: 3,
  input: [100],
  series: 'tiny-hunt',
};

beforeEach(() => {
  env = { VAULT: new FakeKV(), ADMIN_KEY: ADMIN };
});

describe('hunt series: the rolling frontier', () => {
  it('publishes the next territory once a block is fully surveyed, and only once', async () => {
    expect((await adminPut(TINY)).body.ok).toBe(true);
    const a = await enlist('donor-a');
    const b = await enlist('donor-b');
    expect((await call('/fg/task/tiny-hunt')).body.series).toBe('tiny-hunt');

    // Still being surveyed — the frontier must not move.
    expect((await settle('tiny-hunt', 0, a, b)).settled).toBe(true);
    expect(await advanced()).toEqual([]);

    // Finish the block.
    expect((await settle('tiny-hunt', 1, a, b)).settled).toBe(true);
    expect((await settle('tiny-hunt', 2, a, b)).settled).toBe(true);
    expect((await call('/fg/tasks')).body.tasks.find((t) => t.id === 'tiny-hunt').chunksSettled).toBe(3);

    expect(await advanced()).toEqual([{ series: 'tiny-hunt', id: 'tiny-hunt-130', from: 130, part: 2 }]);

    const next = (await call('/fg/task/tiny-hunt-130')).body;
    expect(next.input).toEqual([130]); // starts exactly where the last block ended
    expect(next.kind).toBe('primegap');
    expect(next.chunkSize).toBe(10);
    expect(next.chunkCount).toBe(3);
    expect(next.chunksSettled).toBe(0);
    expect(next.series).toBe('tiny-hunt');
    expect(next.title).toBe('Tiny hunt (part 2)');
    expect(next.description).toBe('a test block'); // one map, so one description

    // Called again: the new head is unfinished, so nothing happens.
    expect(await advanced()).toEqual([]);
    expect((await call('/fg/tasks')).body.tasks.filter((t) => t.series === 'tiny-hunt').length).toBe(2);
  });

  it('leaves tasks that never opted in alone', async () => {
    const { series, ...lone } = TINY;
    expect(series).toBe('tiny-hunt');
    await adminPut({ ...lone, id: 'lone-task', chunkCount: 1 });
    const a = await enlist('donor-c');
    const b = await enlist('donor-d');
    expect((await settle('lone-task', 0, a, b)).settled).toBe(true);
    expect(await advanced()).toEqual([]);
    expect((await call('/fg/tasks')).body.tasks.length).toBe(1);
  });

  it('keeps the series through a republish, and reports where each block starts', async () => {
    await adminPut(TINY);
    const { series, ...withoutSeries } = TINY; // the publisher omits the field
    expect(series).toBe('tiny-hunt');
    expect((await adminPut(withoutSeries)).body.ok).toBe(true);
    const t = (await call('/fg/tasks')).body.tasks.find((x) => x.id === 'tiny-hunt');
    expect(t.series).toBe('tiny-hunt');
    expect(t.from).toBe(100);
  });

  it('refuses a malformed series name instead of storing it', async () => {
    await adminPut({ ...TINY, id: 'bad-series', series: 'Not A Series' });
    expect((await call('/fg/task/bad-series')).body.series).toBe(null);
  });
});

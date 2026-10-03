/**
 * FriendCredit Bureau vault — a tiny shared-ledger API for static apps.
 *
 * Storage: one Cloudflare KV entry per bureau.
 *   key  fc:v1:<CODE>  → JSON { v, friends, transactions, updatedAt }
 *
 * The bureau code is the credential: it travels in the "x-vault-code"
 * header and must match the code in the URL. ADMIN_KEY unlocks the
 * cross-bureau admin routes (list / delete any).
 *
 * Endpoints (all JSON):
 *   GET    /health                 → { ok }
 *   GET    /bureau/<CODE>          → { v, friends, transactions } | 404 unknown | 401 bad code
 *   PUT    /bureau/<CODE>          → body { expectedV, state }; CAS: fails 409 if remote v moved
 *   DELETE /bureau/<CODE>          → { ok } (wipes this bureau; code required)
 *   GET/PUT/DELETE /league/<CODE>  → same contract for Daily Puzzle League states
 *                                   ({ players, results } payloads; KV prefix pl:v1:)
 *   GET    /admin/bureaus          → { bureaus: [{code, kind, size, updatedAt}] } (admin)
 *   DELETE /admin/bureaus/<CODE>   → { ok }                                      (admin)
 *
 * FleetGrid (donated idle compute; KV prefixes fg:v1:task/claims/node):
 *   POST /fg/register        { name } → { nodeId, nodeKey }          (open)
 *   GET  /fg/tasks           → live task summaries + progress        (open)
 *   GET  /fg/task/<ID>       → full manifest (code, input, chunks)   (open)
 *   GET  /fg/task/<ID>/results → settled chunk results               (open)
 *   POST /fg/claim           { taskId? } → { taskId, chunkIndex }    (node)
 *   POST /fg/submit          { taskId, chunkIndex, resultB64, ms }   (node)
 *   GET  /fg/me              → this node's credits + stats           (node)
 *   GET  /fg/stats           → fleet-wide counters                   (open)
 *   GET  /fg/leaderboard     → top nodes by FleetCredits             (open)
 *   PUT    /fg/admin/tasks   → publish a vetted task                 (admin)
 *   PATCH  /fg/admin/tasks/<ID> { status: live|paused }               (admin)
 *   DELETE /fg/admin/tasks/<ID>                                    (admin)
 *   GET    /fg/admin/nodes   → all nodes                             (admin)
 *   DELETE /fg/admin/nodes/<ID>                                    (admin)
 */

const KEY_PREFIX = 'fc:v1:';
const LEAGUE_PREFIX = 'pl:v1:'; // Daily Puzzle League states share the same KV namespace
const FG_TASK = 'fg:v1:task:'; // FleetGrid task manifests
const FG_CLAIMS = 'fg:v1:claims:'; // FleetGrid chunk state per task
const FG_NODE = 'fg:v1:node:'; // FleetGrid donor nodes (id → { keyHash, credits, ... })
const MAX_BODY_BYTES = 512 * 1024; // 512 KB is plenty for a friend ledger
const CODE_RE = /^[A-Za-z0-9-]{4,40}$/;
const FG_NODE_RE = /^n-[0-9a-f]{10}$/;
const FG_CLAIM_TTL_MS = 10 * 60 * 1000; // a stalled claim is stealable after this
const FG_RESULT_B64_MAX = 64 * 1024; // results above this are settled by hash only;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, PUT, DELETE, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-vault-code, x-admin-key, x-fg-node, x-fg-key',
  'access-control-max-age': '86400',
};

const codeOk = (code) => typeof code === 'string' && CODE_RE.test(code);

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------- FleetGrid helpers (donated idle compute) ----------
const FG_CREDITS_PER_CHUNK = 25; // FleetCredits™ per settled chunk, to each agreeing node
const FG_TASK_ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

async function fgSha256Hex(data) {
  const d = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fgAuthNode(env, request) {
  const id = request.headers.get('x-fg-node') || '';
  const key = request.headers.get('x-fg-key') || '';
  if (!FG_NODE_RE.test(id) || !key) return null;
  const raw = await env.VAULT.get(FG_NODE + id);
  if (!raw) return null;
  const node = JSON.parse(raw);
  if ((await fgSha256Hex(new TextEncoder().encode(key))) !== node.keyHash) return null;
  return { id, ...node }; // id rides along — every caller keys writes on it
}

async function fgGetTask(env, id) {
  const raw = await env.VAULT.get(FG_TASK + id);
  return raw ? JSON.parse(raw) : null;
}

/**
 * First claimable chunk index. A chunk is claimable when:
 *   - it was never touched, or
 *   - its first cruncher vanished (stalled 'c' claim), or
 *   - it is parked ('p': one result waiting for a second opinion) and no
 *     second cruncher holds a live claim (cBy) — the second cruncher never
 *     disturbs the stored first result.
 */
function fgFindOpenChunk(task, claims, now) {
  const n = task.chunkCount | 0;
  for (let i = 0; i < n; i++) {
    const e = claims.chunks[i];
    if (!e) return i;
    if (e.s === 'c' && now - e.at > FG_CLAIM_TTL_MS) return i;
    if (e.s === 'p' && (!e.cBy || now - e.cAt > FG_CLAIM_TTL_MS)) return i;
  }
  return -1;
}

async function fgListTasks(env) {
  const ids = [];
  let cursor;
  do {
    const page = await env.VAULT.list({ prefix: FG_TASK, cursor });
    for (const k of page.keys) ids.push(k.name.slice(FG_TASK.length));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  const tasks = [];
  for (const id of ids) {
    const t = await fgGetTask(env, id);
    if (t) tasks.push(t);
  }
  return tasks;
}

async function fgListNodes(env) {
  const ids = [];
  let cursor;
  do {
    const page = await env.VAULT.list({ prefix: FG_NODE, cursor });
    for (const k of page.keys) ids.push(k.name.slice(FG_NODE.length));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  const nodes = [];
  for (const id of ids) {
    const raw = await env.VAULT.get(FG_NODE + id);
    if (raw) nodes.push({ id, ...JSON.parse(raw) });
  }
  return nodes;
}

async function fgCredit(env, nodeId, ms) {
  const raw = await env.VAULT.get(FG_NODE + nodeId);
  if (!raw) return 0; // node deleted since it started — no ghost accounts
  const node = JSON.parse(raw);
  node.credits = (node.credits || 0) + FG_CREDITS_PER_CHUNK;
  node.chunks = (node.chunks || 0) + 1;
  node.ms = (node.ms || 0) + (Number(ms) || 0);
  node.lastSeenAt = new Date().toISOString();
  await env.VAULT.put(FG_NODE + nodeId, JSON.stringify(node));
  return FG_CREDITS_PER_CHUNK;
}

async function fgRoutes(request, env, path, method) {
  const url = new URL(request.url);
  const now = Date.now();

  // --- open routes ---
  if (path === '/fg/register' && method === 'POST') {
    const body = await readJson(request);
    const name = String(body?.name || '').trim().slice(0, 40) || 'anon node';
    const nodeId =
      'n-' + [...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const nodeKey =
      'fgk_' + [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const node = {
      keyHash: await fgSha256Hex(new TextEncoder().encode(nodeKey)),
      name,
      credits: 0,
      chunks: 0,
      ms: 0,
      lastClaimAt: null,
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    await env.VAULT.put(FG_NODE + nodeId, JSON.stringify(node));
    return json({ nodeId, nodeKey });
  }

  if (path === '/fg/tasks' && method === 'GET') {
    const tasks = await fgListTasks(env);
    return json({
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        kind: t.kind,
        description: t.description,
        status: t.status,
        chunkSize: t.chunkSize,
        chunkCount: t.chunkCount,
        chunksSettled: t.chunksSettled || 0,
        createdAt: t.createdAt,
      })),
    });
  }

  const fgTaskGet = path.match(/^\/fg\/task\/([a-z0-9][a-z0-9-]{0,40})$/);
  if (fgTaskGet && method === 'GET') {
    const task = await fgGetTask(env, fgTaskGet[1]);
    if (!task) return json({ error: 'unknown_task' }, 404);
    return json(task);
  }

  const fgResGet = path.match(/^\/fg\/task\/([a-z0-9][a-z0-9-]{0,40})\/results$/);
  if (fgResGet && method === 'GET') {
    const task = await fgGetTask(env, fgResGet[1]);
    if (!task) return json({ error: 'unknown_task' }, 404);
    const raw = await env.VAULT.get(FG_CLAIMS + fgResGet[1]);
    const claims = raw ? JSON.parse(raw) : { chunks: {} };
    const limit = Math.min(Number(url.searchParams.get('limit')) || 200, 1000);
    const results = [];
    let mismatches = 0;
    for (const [i, e] of Object.entries(claims.chunks)) {
      mismatches += e.mm || 0;
      if (e.s !== 's') continue;
      if (results.length >= limit) continue;
      results.push({
        chunkIndex: Number(i),
        by: e.by,
        ms: e.ms || null,
        resultHash: e.h,
        resultB64: e.r ?? null,
        bytes: e.r ? atob(e.r).length : null,
      });
    }
    return json({ taskId: task.id, settled: results.length, mismatches, results });
  }

  if (path === '/fg/stats' && method === 'GET') {
    const tasks = await fgListTasks(env);
    const nodes = await fgListNodes(env);
    const chunksTotal = tasks.reduce((a, t) => a + t.chunkCount, 0);
    const chunksSettled = tasks.reduce((a, t) => a + (t.chunksSettled || 0), 0);
    return json({
      tasks: tasks.length,
      chunksTotal,
      chunksSettled,
      creditsAwarded: nodes.reduce((a, n) => a + (n.credits || 0), 0),
      nodes: nodes.length,
    });
  }

  if (path === '/fg/leaderboard' && method === 'GET') {
    const nodes = await fgListNodes(env);
    nodes.sort((a, b) => (b.credits || 0) - (a.credits || 0));
    return json({
      leaders: nodes.slice(0, 20).map((n) => ({
        nodeId: n.id,
        name: n.name,
        credits: n.credits || 0,
        chunks: n.chunks || 0,
        ms: n.ms || 0,
      })),
    });
  }

  // --- node-auth routes ---
  if (path === '/fg/claim' && method === 'POST') {
    const node = await fgAuthNode(env, request);
    if (!node) return json({ error: 'unauthorized' }, 401);
    const body = await readJson(request);
    let tasks = await fgListTasks(env);
    if (body?.taskId) tasks = tasks.filter((t) => t.id === body.taskId);
    tasks = tasks.filter((t) => t.status === 'live');
    for (const task of tasks) {
      const raw = await env.VAULT.get(FG_CLAIMS + task.id);
      const claims = raw ? JSON.parse(raw) : { chunks: {} };
      const i = fgFindOpenChunk(task, claims, now);
      if (i < 0) continue;
      const e = claims.chunks[i];
      if (!e) claims.chunks[i] = { s: 'c', by: [node.id], at: now };
      else {
        // Parked chunk: record the second cruncher without touching the result.
        e.cBy = node.id;
        e.cAt = now;
      }
      await env.VAULT.put(FG_CLAIMS + task.id, JSON.stringify(claims));
      node.lastClaimAt = new Date().toISOString();
      node.lastSeenAt = node.lastClaimAt;
      await env.VAULT.put(FG_NODE + node.id, JSON.stringify(node));
      return json({ taskId: task.id, chunkIndex: i, chunkSize: task.chunkSize });
    }
    return json({ done: true });
  }

  if (path === '/fg/submit' && method === 'POST') {
    const node = await fgAuthNode(env, request);
    if (!node) return json({ error: 'unauthorized' }, 401);
    const body = await readJson(request);
    const taskId = String(body?.taskId || '');
    const chunkIndex = Number(body?.chunkIndex);
    const resultB64 = String(body?.resultB64 || '');
    if (!FG_TASK_ID_RE.test(taskId) || !Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return json({ error: 'bad_request' }, 400);
    }
    if (resultB64.length * 0.75 > FG_RESULT_B64_MAX) return json({ error: 'result_too_large' }, 400);
    const task = await fgGetTask(env, taskId);
    if (!task || chunkIndex >= task.chunkCount) return json({ error: 'unknown_task' }, 404);

    let bytes;
    try {
      bytes = Uint8Array.from(atob(resultB64), (c) => c.charCodeAt(0));
    } catch {
      return json({ error: 'bad_result_encoding' }, 400);
    }
    const hash = await fgSha256Hex(bytes);

    const claimsKey = FG_CLAIMS + taskId;
    const raw = await env.VAULT.get(claimsKey);
    const claims = raw ? JSON.parse(raw) : { chunks: {} };
    const e = claims.chunks[chunkIndex];

    if (e && e.s === 's') return json({ ok: true, settled: true, credits: 0 });

    let settled = false;
    if (e && e.h) {
      // A first result is parked — this submission is the second opinion.
      if (e.by.includes(node.id)) return json({ ok: true, settled: false, credits: 0 });
      if (e.h === hash) {
        e.s = 's';
        e.by.push(node.id);
        if (resultB64) e.r = resultB64;
        settled = true;
      } else {
        // Disagreement — requeue for a fresh pair of nodes.
        claims.chunks[chunkIndex] = { s: 'c', by: [], at: 0, mm: (e.mm || 0) + 1 };
      }
    } else {
      // First result for this chunk — park it and wait for a second opinion.
      claims.chunks[chunkIndex] = { s: 'p', by: [node.id], at: now, h: hash, ms: Number(body?.ms) || 0 };
    }

    await env.VAULT.put(claimsKey, JSON.stringify(claims));
    if (settled) {
      await fgCredit(env, e.by[0], e.ms);
      await fgCredit(env, node.id, Number(body?.ms) || 0);
      task.chunksSettled = (task.chunksSettled || 0) + 1;
      await env.VAULT.put(FG_TASK + taskId, JSON.stringify(task));
    } else {
      node.lastSeenAt = new Date().toISOString();
      await env.VAULT.put(FG_NODE + node.id, JSON.stringify(node));
    }
    return json({ ok: true, settled, credits: settled ? FG_CREDITS_PER_CHUNK : 0 });
  }

  if (path === '/fg/me' && method === 'GET') {
    const node = await fgAuthNode(env, request);
    if (!node) return json({ error: 'unauthorized' }, 401);
    return json({
      nodeId: node.id,
      name: node.name,
      credits: node.credits || 0,
      chunks: node.chunks || 0,
      ms: node.ms || 0,
      lastClaimAt: node.lastClaimAt,
    });
  }

  // --- admin routes ---
  if (!env.ADMIN_KEY || request.headers.get('x-admin-key') !== env.ADMIN_KEY) {
    return json({ error: 'forbidden' }, 403);
  }

  if (path === '/fg/admin/tasks' && method === 'PUT') {
    const body = await readJson(request);
    if (!body) return json({ error: 'bad_request' }, 400);
    const title = String(body.title || '').trim().slice(0, 80);
    const chunkCount = Number(body.chunkCount);
    const chunkSize = Number(body.chunkSize) || 1000;
    // `code` is optional and unused by current nodes (which run vetted built-in
    // task kinds) — accepted for forward-compat with remote-code tasks later.
    const code = typeof body.code === 'string' ? body.code : '';
    const input = body.input ?? [];
    if (!title || !Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 4096) {
      return json({ error: 'bad_request' }, 400);
    }
    if (chunkSize < 1 || chunkSize > 65536) return json({ error: 'bad_chunk_size' }, 400);
    if (code.length > 131072) return json({ error: 'bad_code' }, 400);
    if (JSON.stringify(input).length > 262144) return json({ error: 'input_too_large' }, 400);
    const id =
      String(body.id || title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'task';
    if (!FG_TASK_ID_RE.test(id)) return json({ error: 'bad_id' }, 400);
    const existing = await fgGetTask(env, id);
    const task = {
      id,
      title,
      kind: String(body.kind || 'map').slice(0, 20),
      description: String(body.description || '').slice(0, 500),
      chunkSize,
      chunkCount,
      input,
      code,
      status: body.status === 'paused' ? 'paused' : 'live',
      chunksSettled: existing && existing.chunkCount === chunkCount ? existing.chunksSettled || 0 : 0,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    await env.VAULT.put(FG_TASK + id, JSON.stringify(task));
    if (!existing) await env.VAULT.put(FG_CLAIMS + id, JSON.stringify({ chunks: {} }));
    return json({ ok: true, id });
  }

  const fgAdminTask = path.match(/^\/fg\/admin\/tasks\/([a-z0-9][a-z0-9-]{0,40})$/);
  if (fgAdminTask && method === 'PATCH') {
    const body = await readJson(request);
    const status = body?.status;
    if (status !== 'live' && status !== 'paused') return json({ error: 'bad_request' }, 400);
    const task = await fgGetTask(env, fgAdminTask[1]);
    if (!task) return json({ error: 'unknown_task' }, 404);
    task.status = status;
    await env.VAULT.put(FG_TASK + task.id, JSON.stringify(task));
    return json({ ok: true, status });
  }
  if (fgAdminTask && method === 'DELETE') {
    await env.VAULT.delete(FG_TASK + fgAdminTask[1]);
    await env.VAULT.delete(FG_CLAIMS + fgAdminTask[1]);
    return json({ ok: true });
  }

  if (path === '/fg/admin/nodes' && method === 'GET') {
    return json({ nodes: await fgListNodes(env) });
  }
  const fgAdminNode = path.match(/^\/fg\/admin\/nodes\/(n-[0-9a-f]{10})$/);
  if (fgAdminNode && method === 'DELETE') {
    await env.VAULT.delete(FG_NODE + fgAdminNode[1]);
    return json({ ok: true });
  }

  return json({ error: 'not_found' }, 404);
}

function validateState(state) {
  if (!state || typeof state !== 'object') return false;
  // Known app lists; each app sends the ones it uses. Unknown apps could
  // reuse the same schema with a different list name later.
  for (const key of ['friends', 'transactions', 'tasks', 'players', 'results']) {
    const list = state[key];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length > 5000) return false;
    if (!list.every((item) => item && typeof item.id === 'string')) return false;
  }
  // Tombstones: { id, deletedAt } markers so deletions propagate between
  // devices instead of being undone by the next merge.
  if (state.tombstones !== undefined) {
    const tb = state.tombstones;
    if (!Array.isArray(tb) || tb.length > 20000) return false;
    if (!tb.every((t) => t && typeof t.id === 'string' && Number.isFinite(Number(t.deletedAt)))) {
      return false;
    }
  }
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (path === '/health') {
      return json({ ok: true, service: 'bureau-vault' });
    }

    // ---------- admin ----------
    if (path === '/admin/bureaus' && method === 'GET') {
      if (!env.ADMIN_KEY || request.headers.get('x-admin-key') !== env.ADMIN_KEY) {
        return json({ error: 'forbidden' }, 403);
      }
      const bureaus = [];
      for (const prefix of [KEY_PREFIX, LEAGUE_PREFIX]) {
        let cursor;
        do {
          const page = await env.VAULT.list({ prefix, cursor });
          for (const k of page.keys) {
            bureaus.push({
              code: k.name.slice(prefix.length),
              kind: prefix === LEAGUE_PREFIX ? 'league' : 'bureau',
              size: k.metadata?.size ?? null,
              updatedAt: k.metadata?.updatedAt ?? null,
            });
          }
          cursor = page.list_complete ? undefined : page.cursor;
        } while (cursor);
      }
      return json({ bureaus });
    }

    const adminDelMatch = path.match(/^\/admin\/bureaus\/([A-Za-z0-9-]+)$/);
    if (adminDelMatch && method === 'DELETE') {
      if (!env.ADMIN_KEY || request.headers.get('x-admin-key') !== env.ADMIN_KEY) {
        return json({ error: 'forbidden' }, 403);
      }
      await env.VAULT.delete(KEY_PREFIX + adminDelMatch[1]);
      await env.VAULT.delete(LEAGUE_PREFIX + adminDelMatch[1]);
      return json({ ok: true });
    }

    // ---------- league routes (Daily Puzzle League) ----------
    // Kept above the bureau router: that one 404s any non-/bureau path.
    const lm = path.match(/^\/league\/([A-Za-z0-9-]+)$/);
    if (lm) {
      const code = lm[1];
      const codeHeader = request.headers.get('x-vault-code');
      if (!codeOk(code) || codeHeader !== code) {
        return json({ error: 'unauthorized' }, 401);
      }
      const key = LEAGUE_PREFIX + code;

      if (method === 'GET') {
        const raw = await env.VAULT.get(key);
        if (raw == null) return json({ error: 'unknown_league' }, 404);
        const state = JSON.parse(raw);
        return json({
          v: state.v ?? 1,
          players: state.players,
          results: state.results,
          tombstones: state.tombstones,
          updatedAt: state.updatedAt,
        });
      }

      if (method === 'PUT') {
        const body = await readJson(request);
        if (!body || !validateState(body.state)) {
          return json({ error: 'bad_request' }, 400);
        }
        const expectedV = Number(body.expectedV);
        if (!Number.isInteger(expectedV) || expectedV < 0) {
          return json({ error: 'bad_request' }, 400);
        }
        const remoteRaw = await env.VAULT.get(key);
        if (remoteRaw == null && expectedV !== 0) {
          return json({ error: 'conflict', remoteV: 0, reason: 'deleted_elsewhere' }, 409);
        }
        if (remoteRaw != null) {
          const remote = JSON.parse(remoteRaw);
          const remoteV = remote.v ?? 1;
          if (remoteV !== expectedV) {
            return json({ error: 'conflict', remoteV, reason: 'version_moved' }, 409);
          }
        }
        const nextState = {
          v: expectedV + 1,
          players: body.state.players,
          results: body.state.results,
          tombstones: body.state.tombstones,
          updatedAt: new Date().toISOString(),
        };
        await env.VAULT.put(key, JSON.stringify(nextState), {
          metadata: { size: JSON.stringify(nextState).length, updatedAt: nextState.updatedAt },
        });
        return json({ ok: true, v: nextState.v });
      }

      if (method === 'DELETE') {
        const raw = await env.VAULT.get(key);
        await env.VAULT.delete(key);
        return json({ ok: true, existed: raw != null });
      }

      return json({ error: 'method_not_allowed' }, 405);
    }

    // ---------- FleetGrid routes (donated idle compute) ----------
    if (path === '/fg' || path.startsWith('/fg/')) {
      return fgRoutes(request, env, path, method);
    }

    // ---------- bureau routes ----------
    const m = path.match(/^\/bureau\/([A-Za-z0-9-]+)$/);
    if (!m) return json({ error: 'not_found' }, 404);
    const code = m[1];
    const codeHeader = request.headers.get('x-vault-code');

    // The code in the path must match the header. (The path alone is not
    // enough so codes never leak into caches or logs as the sole credential.)
    if (!codeOk(code) || codeHeader !== code) {
      return json({ error: 'unauthorized' }, 401);
    }
    const key = KEY_PREFIX + code;

    if (method === 'GET') {
      const raw = await env.VAULT.get(key);
      if (raw == null) return json({ error: 'unknown_bureau' }, 404);
      const state = JSON.parse(raw);
      return json({
        v: state.v ?? 1,
        friends: state.friends,
        transactions: state.transactions,
        tasks: state.tasks,
        tombstones: state.tombstones,
        updatedAt: state.updatedAt,
      });
    }

    if (method === 'PUT') {
      const body = await readJson(request);
      if (!body || !validateState(body.state)) {
        return json({ error: 'bad_request' }, 400);
      }
      const expectedV = Number(body.expectedV);
      if (!Number.isInteger(expectedV) || expectedV < 0) {
        return json({ error: 'bad_request' }, 400);
      }
      const remoteRaw = await env.VAULT.get(key);
      if (remoteRaw == null && expectedV !== 0) {
        return json({ error: 'conflict', remoteV: 0, reason: 'deleted_elsewhere' }, 409);
      }
      if (remoteRaw != null) {
        const remote = JSON.parse(remoteRaw);
        const remoteV = remote.v ?? 1;
        if (remoteV !== expectedV) {
          return json({ error: 'conflict', remoteV, reason: 'version_moved' }, 409);
        }
      }
      const nextState = {
        v: expectedV + 1,
        friends: body.state.friends,
        transactions: body.state.transactions,
        tasks: body.state.tasks,
        tombstones: body.state.tombstones,
        updatedAt: new Date().toISOString(),
      };
      await env.VAULT.put(key, JSON.stringify(nextState), {
        metadata: { size: JSON.stringify(nextState).length, updatedAt: nextState.updatedAt },
      });
      return json({ ok: true, v: nextState.v });
    }

    if (method === 'DELETE') {
      const raw = await env.VAULT.get(key);
      await env.VAULT.delete(key);
      return json({ ok: true, existed: raw != null });
    }

    return json({ error: 'method_not_allowed' }, 405);
  },
};

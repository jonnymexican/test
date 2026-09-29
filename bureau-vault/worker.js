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
 *   GET    /admin/bureaus          → { bureaus: [{code, size, updatedAt}] }   (admin)
 *   DELETE /admin/bureaus/<CODE>   → { ok }                                    (admin)
 */

const KEY_PREFIX = 'fc:v1:';
const MAX_BODY_BYTES = 512 * 1024; // 512 KB is plenty for a friend ledger
const CODE_RE = /^[A-Za-z0-9-]{4,40}$/;

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
  'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, x-vault-code, x-admin-key',
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

function validateState(state) {
  if (!state || typeof state !== 'object') return false;
  if (!Array.isArray(state.friends)) return false;
  if (!Array.isArray(state.transactions)) return false;
  if (state.friends.length > 500 || state.transactions.length > 5000) return false;
  return state.friends.every(
    (f) => f && typeof f.id === 'string' && typeof f.name === 'string'
  ) && state.transactions.every(
    (t) => t && typeof t.id === 'string' && typeof t.friendId === 'string'
  );
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
      let cursor;
      do {
        const page = await env.VAULT.list({ prefix: KEY_PREFIX, cursor });
        for (const k of page.keys) {
          bureaus.push({
            code: k.name.slice(KEY_PREFIX.length),
            size: k.metadata?.size ?? null,
            updatedAt: k.metadata?.updatedAt ?? null,
          });
        }
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return json({ bureaus });
    }

    const adminDelMatch = path.match(/^\/admin\/bureaus\/([A-Za-z0-9-]+)$/);
    if (adminDelMatch && method === 'DELETE') {
      if (!env.ADMIN_KEY || request.headers.get('x-admin-key') !== env.ADMIN_KEY) {
        return json({ error: 'forbidden' }, 403);
      }
      await env.VAULT.delete(KEY_PREFIX + adminDelMatch[1]);
      return json({ ok: true });
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
      return json({ v: state.v ?? 1, friends: state.friends ?? [], transactions: state.transactions ?? [] });
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

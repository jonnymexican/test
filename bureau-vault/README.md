# Bureau vault (Cloudflare Worker)

A tiny shared-storage API so FriendCredit (and any other fleet app) can sync a
ledger across devices. Free tier: 100,000 requests/day, no credit card.

## One-time setup (~10 minutes)

1. Create a free account at <https://dash.cloudflare.com/> (sign up, no card).
2. Install the deploy tool once, in the main repo root:
   ```
   npm install -g wrangler   # or: npx wrangler <cmd> everywhere below
   npx wrangler login
   ```
3. Create the KV namespace and paste its id into `wrangler.toml`:
   ```
   npx wrangler kv namespace create VAULT
   ```
4. Set the admin key (anything long and random — this is *your* master key):
   ```
   npx wrangler secret put ADMIN_KEY
   ```
5. Deploy:
   ```
   npx wrangler deploy
   ```
   Note the printed URL, e.g. `https://bureau-vault.<your-subdomain>.workers.dev`.

## Smoke test

```
curl https://bureau-vault.<you>.workers.dev/health
# → {"ok":true,"service":"bureau-vault"}

curl -X PUT https://bureau-vault.<you>.workers.dev/bureau/test-bureau \
  -H "x-vault-code: test-bureau" -H "content-type: application/json" \
  -d '{"expectedV":0,"state":{"friends":[],"transactions":[]}}'
# → {"ok":true,"v":1}
```

## Bureau codes

A **bureau code** (4–40 chars: letters, digits, dashes) identifies and protects
one shared ledger. Whoever knows the code can read and write that bureau —
treat it like a group password. Generate a good one, e.g.
`bureau-golden-mountain-742`. Each friend group enters their own code in
FriendCredit → Bureau Stats → Shared vault.

## Admin powers (you)

```
# List every bureau (code, size, last update):
curl -H "x-admin-key: <ADMIN_KEY>" \
  https://bureau-vault.<you>.workers.dev/admin/bureaus

# Delete any bureau (e.g. spam or a forgotten test):
curl -X DELETE -H "x-admin-key: <ADMIN_KEY>" \
  https://bureau-vault.<you>.workers.dev/admin/bureaus/<CODE>
```

## Costs

KV free tier: 100k reads/day, 1k writes/day, 1GB storage. A friend group will
use a rounding error of that. No credit card required.

# Daily Puzzle League

One "Crack the Number" puzzle per day — the same puzzle for every player, everywhere. Lives in the
Jon's Apps fleet as a sub-app bundled into the same GitHub Pages artifact as vicinityGo.

**URL:** https://jonnymexican.github.io/test/puzzleleague/

## How the daily puzzle works

- A day number (UTC days since `2026-09-28`, see `PUZZLE_EPOCH` in `src/puzzle.js`) seeds a
  deterministic PRNG, so day N is the same puzzle forever, on every device.
- The generator picks four distinct numbers in 2..9, builds an arithmetic expression with a positive
  integer target, then derives candidate clues (sums, differences, products, quotients, reveals).
- A brute-force solver over all 715 possible sets **proves the clue set admits exactly one answer**
  before the puzzle ships (≤ 6 clues, 2 free). No unsolvable or ambiguous days.
- Scoring: fewer revealed clues and fewer wrong guesses is better (`scoreFor`); streaks count
  consecutive solved UTC days.

## League sync

Shared leagues use the same [bureau-vault](../bureau-vault) Cloudflare Worker as FriendCredit and
adhdTracker, via the `/league/<CODE>` routes (KV prefix `pl:v1:`):

- State: `{ players, results, tombstones }` — one result per player per day, id `<playerId>:<dayNum>`.
- The league code is the credential (`x-vault-code` header, CAS on `v`), same merge rules as the
  other apps: union by id, newest `updatedAt ?? createdAt` wins, tombstones for deletions.
- Joining with a fresh code creates the league from local history; the first poll every 30 s pulls
  remote scores, and mutations queue a debounced push 1.2 s later.

## Develop

```bash
npm install   # inside puzzleleague/
npm test      # vitest: engine, sync client, and a full-app smoke test
npm run dev   # vite on :3002
npm run build # outputs dist/, bundled into the root Pages deploy
```

The Worker must be deployed for league sync (`../bureau-vault/README.md`).

#!/usr/bin/env node
/**
 * Publish the FleetGrid demo tasks to the bureau-vault Worker (admin).
 *
 *   cd bureau-vault
 *   npx wrangler secret put ADMIN_KEY      # once — or set ADMIN_KEY env
 *   node scripts/publish-fg-task.mjs https://bureau-vault.jonnymexican.workers.dev
 */
const base = (process.argv[2] || 'https://bureau-vault.jonnymexican.workers.dev').replace(/\/+$/, '');
const admin = process.env.ADMIN_KEY;
if (!admin) {
  console.error('Set ADMIN_KEY (wrangler secret value) in the environment first.');
  process.exit(1);
}
const auth = { 'x-admin-key': admin, 'content-type': 'application/json', 'user-agent': 'fleetgrid-publisher' };

const TASKS = [
  {
    id: 'collatz-survey',
    title: 'Collatz terrain survey',
    kind: 'collatz',
    description:
      'Map the stopping time of every starting value in [1, 1,000,000). Pure arithmetic — the fleet’s proving ground.',
    chunkSize: 5000,
    chunkCount: 200,
    input: [1],
  },
  {
    id: 'prime-gaps',
    title: 'Prime census: the first million',
    kind: 'primes',
    description:
      'Count primes in [0, 1,000,000). History says 78,498 — a known answer makes this the grid’s integrity yardstick.',
    chunkSize: 5000,
    chunkCount: 200,
    input: [],
  },
];

for (const task of TASKS) {
  const res = await fetch(`${base}/fg/admin/tasks`, { method: 'PUT', headers: auth, body: JSON.stringify(task) });
  const body = await res.json();
  console.log(res.ok ? `published ${task.id} (chunkSize ${task.chunkSize} × ${task.chunkCount})` : `FAILED ${task.id}: ${res.status} ${JSON.stringify(body)}`);
}

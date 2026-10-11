#!/usr/bin/env node
/**
 * Publish the FleetGrid tasks to the bureau-vault Worker (admin).
 *
 * The definitions come from public/grid/grid-core.js — the same module the donor
 * nodes run — so what the fleet publishes can never drift from what the grid
 * computes. (It did once: this script's own copy of the task list still had the
 * prime survey starting at zero while the nodes had moved to 1,000,000,000.)
 *
 * Republishing is safe: the Worker keeps existing progress when a task's chunk
 * geometry is unchanged.
 *
 *   cd bureau-vault
 *   npx wrangler secret put ADMIN_KEY      # once — or set ADMIN_KEY env
 *   node scripts/publish-fg-task.mjs https://bureau-vault.jonnymexican.workers.dev
 */
import { DEMO_TASKS } from '../../public/grid/grid-core.js';

const base = (process.argv[2] || 'https://bureau-vault.jonnymexican.workers.dev').replace(/\/+$/, '');
const admin = process.env.ADMIN_KEY;
if (!admin) {
  console.error('Set ADMIN_KEY (wrangler secret value) in the environment first.');
  process.exit(1);
}
const auth = { 'x-admin-key': admin, 'content-type': 'application/json', 'user-agent': 'fleetgrid-publisher' };

/** The admin payload is the manifest minus what the Worker owns. */
const payload = (t) => ({
  id: t.id,
  title: t.title,
  kind: t.kind,
  description: t.description,
  chunkSize: t.chunkSize,
  chunkCount: t.chunkCount,
  input: t.input,
  // Opt-in: a series whose territory tiles forward when the block is finished.
  ...(t.series ? { series: t.series } : {}),
});

let failed = 0;
for (const task of DEMO_TASKS) {
  const res = await fetch(`${base}/fg/admin/tasks`, { method: 'PUT', headers: auth, body: JSON.stringify(payload(task)) });
  const body = await res.json();
  if (res.ok) {
    const territory = task.chunkSize * task.chunkCount;
    const series = task.series ? ` · series '${task.series}'` : '';
    console.log(`published ${task.id} (${task.kind} · ${task.chunkSize} × ${task.chunkCount} = ${territory.toLocaleString()} numbers from ${task.input[0] || 0})${series}`);
  } else {
    failed++;
    console.log(`FAILED ${task.id}: ${res.status} ${JSON.stringify(body)}`);
  }
}
process.exit(failed ? 1 : 0);

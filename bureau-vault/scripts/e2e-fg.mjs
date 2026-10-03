// Temporary end-to-end FleetGrid protocol test against the live worker.
const BASE = 'https://bureau-vault.jonnymexican.workers.dev';
const j = (r) => r.json();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');

// Local replicas of the vetted task kinds (deterministic math).
function collatz(chunk, input) {
  const out = [];
  for (let k = 0; k < chunk.len; k++) {
    let n = (input[0] || 1) + chunk.start + k, steps = 0;
    while (n !== 1) { n = n % 2 === 0 ? n / 2 : 3 * n + 1; steps++; }
    out.push(steps);
  }
  return out;
}
function primes(chunk) {
  const isPrime = (n) => {
    if (n < 2) return false;
    for (let k = 0; k < 100 && k * k <= n; k++) if (n % k === 0) return false;
    return true;
  };
  let count = 0;
  for (let k = 0; k < chunk.len; k++) if (isPrime(chunk.start + k)) count++;
  return [count];
}
const KINDS = { collatz, primes };

async function main() {
  // Two independent nodes join.
  const nodes = [];
  for (const name of ['e2e-alpha', 'e2e-beta']) {
    const reg = await fetch(BASE + '/fg/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then(j);
    if (!reg.nodeId) throw new Error('register failed: ' + JSON.stringify(reg));
    nodes.push(reg);
  }
  console.log('nodes:', nodes.map((n) => n.nodeId).join(', '));

  const H = (n) => ({ 'content-type': 'application/json', 'x-fg-node': n.nodeId, 'x-fg-key': n.nodeKey });

  // --- Scenario 1: both nodes crunch chunk 0 of prime-gaps; second opinion settles.
  const c1 = await fetch(BASE + '/fg/claim', { method: 'POST', headers: H(nodes[0]), body: '{}' }).then(j);
  if (c1.done) throw new Error('no work available?!');
  console.log(`alpha claims ${c1.taskId} chunk ${c1.chunkIndex}`);

  const task = await fetch(`${BASE}/fg/task/${c1.taskId}`).then(j);
  const result = KINDS[task.kind]({ index: c1.chunkIndex, start: c1.chunkIndex * c1.chunkSize, len: c1.chunkSize }, task.input);

  const s1 = await fetch(BASE + '/fg/submit', {
    method: 'POST', headers: H(nodes[0]),
    body: JSON.stringify({ taskId: c1.taskId, chunkIndex: c1.chunkIndex, resultB64: b64(result), ms: 42 }),
  }).then(j);
  console.log('alpha submit →', JSON.stringify(s1), s1.settled === false ? '(parked ✓)' : '(UNEXPECTED: settled without second opinion!)');

  // Beta claims — must receive the parked chunk for its second opinion.
  let c2 = await fetch(BASE + '/fg/claim', { method: 'POST', headers: H(nodes[1]), body: '{}' }).then(j);
  let hops = 0;
  while (c2.done && hops++ < 3) {
    await new Promise((ok) => setTimeout(ok, 1000));
    c2 = await fetch(BASE + '/fg/claim', { method: 'POST', headers: H(nodes[1]), body: '{}' }).then(j);
  }
  console.log(`beta claims ${c2.taskId} chunk ${c2.chunkIndex}${c2.chunkIndex === c1.chunkIndex ? ' (the parked one ✓)' : ''}`);

  const task2 = c2.taskId === task.id ? task : await fetch(`${BASE}/fg/task/${c2.taskId}`).then(j);
  const result2 = KINDS[task2.kind]({ index: c2.chunkIndex, start: c2.chunkIndex * c2.chunkSize, len: c2.chunkSize }, task2.input);

  const s2 = await fetch(BASE + '/fg/submit', {
    method: 'POST', headers: H(nodes[1]),
    body: JSON.stringify({ taskId: c2.taskId, chunkIndex: c2.chunkIndex, resultB64: b64(result2), ms: 57 }),
  }).then(j);
  console.log('beta submit →', JSON.stringify(s2), s2.settled ? '(settled ✓)' : '(NOT settled!)');

  // --- Scenario 2: a cheater disagrees with settled history → requeue; honest node re-settles.
  const cheat = await fetch(BASE + '/fg/submit', {
    method: 'POST', headers: H(nodes[0]),
    body: JSON.stringify({ taskId: c2.taskId, chunkIndex: c2.chunkIndex, resultB64: b64([999999]), ms: 1 }),
  }).then(j);
  console.log('cheat attempt on settled chunk →', JSON.stringify(cheat), cheat.settled === true ? '(rejected, still settled ✓)' : '(PROBLEM: chunk unsettled!)');

  const stats = await fetch(BASE + '/fg/stats').then(j);
  console.log('stats:', JSON.stringify(stats));
  const board = await fetch(BASE + '/fg/leaderboard').then(j);
  console.log('leaderboard:', board.leaders.map((l) => `${l.name}=${l.credits}cr/${l.chunks}ch`).join(', '));
}

main().catch((e) => { console.error('E2E FAILED:', e.message); process.exit(1); });

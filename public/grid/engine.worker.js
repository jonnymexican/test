/**
 * FleetGrid node engine — runs on a Web Worker so the crunching never
 * touches the page's UI thread. It owns the whole claim → crunch → submit
 * loop; the main thread only steers (start/stop/status) and shows results.
 */
import { TASK_KINDS, encodeResult } from './grid-core.js';

var API = '';
var nodeId = '';
var nodeKey = '';
var running = false;
var seq = 0; // generation counter: stop invalidates in-flight work
var chunkIndex = -1;
var taskId = '';
var chunkStart = 0;

var live = { claims: 0, settles: 0, earned: 0, errors: 0, lastError: '', busy: false };
var poll = null;

function post(type, data) {
  self.postMessage({ type, ...data });
}

function headers() {
  return {
    'content-type': 'application/json',
    'x-fg-node': nodeId,
    'x-fg-key': nodeKey,
  };
}

async function api(path, opts) {
  var res = await fetch(API + path, opts);
  var body = null;
  try { body = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) throw new Error((body && body.error) || 'HTTP ' + res.status);
  return body;
}

function nap(ms) {
  return new Promise(function (ok) {
    poll = setTimeout(ok, ms);
  });
}

async function loop(mySeq) {
  var backoff = 2000;
  while (running && mySeq === seq) {
    try {
      // 1) claim
      var claim = await api('/fg/claim', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
      });
      if (mySeq !== seq) return;

      if (claim.done) {
        live.busy = false;
        post('status', { note: 'No open chunks — the fleet finished everything. Standing by.' });
        await nap(20000);
        continue;
      }

      // 2) fetch the task manifest (code, input, chunk math)
      var task = await api('/fg/task/' + encodeURIComponent(claim.taskId));
      if (mySeq !== seq) return;

      // 3) crunch
      taskId = claim.taskId;
      chunkIndex = claim.chunkIndex;
      chunkStart = claim.chunkIndex * task.chunkSize;
      live.busy = true;
      post('status', {
        note: 'Crunching ' + task.title + ' · chunk ' + (chunkIndex + 1) + '/' + task.chunkCount,
        taskId,
        chunkIndex,
      });
      var t0 = performance.now();
      var result = TASK_KINDS[task.kind]({ index: chunkIndex, start: chunkStart, len: task.chunkSize }, task.input);
      var ms = Math.round(performance.now() - t0);
      if (mySeq !== seq) return;

      // 4) submit (the server pairs it with a second node's verdict)
      var sub = await api('/fg/submit', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          taskId,
          chunkIndex,
          resultB64: encodeResult(task.kind, result),
          ms,
        }),
      });
      if (mySeq !== seq) return;

      live.claims++;
      if (sub.settled) {
        live.settles++;
        live.earned += sub.credits || 0;
        post('settled', { taskId, chunkIndex, credits: sub.credits || 0 });
        post('status', { note: 'Chunk settled — +' + (sub.credits || 0) + ' FleetCredits' });
      } else {
        post('status', { note: 'Result parked — waiting for a second node to agree.' });
      }
      live.busy = false;
      chunkIndex = -1;
      taskId = '';
      backoff = 2000;
    } catch (err) {
      if (mySeq !== seq) return;
      live.errors++;
      live.lastError = String(err.message || err);
      post('status', { note: 'Retry in a moment — ' + live.lastError });
      await nap(backoff);
      backoff = Math.min(backoff * 2, 60000);
    }
  }
}

self.onmessage = async function (e) {
  var m = e.data || {};
  if (m.type === 'start') {
    API = m.api;
    nodeId = m.nodeId;
    nodeKey = m.nodeKey;
    if (running) return;
    running = true;
    seq++;
    post('status', { note: 'Connected — claiming work…' });
    loop(seq);
  } else if (m.type === 'stop') {
    running = false;
    seq++; // invalidates the running loop and any pending nap
    if (poll) { clearTimeout(poll); poll = null; }
    live.busy = false;
    post('status', { note: 'Paused — the grid thanks you for ' + live.earned + ' credits this session.' });
  }
};

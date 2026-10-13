#!/usr/bin/env node
/**
 * load-sockets.mjs — Phase 2/3 measurement harness.
 *
 * Modes:
 *   connect  Capacity: open N sockets (M users, multi-tab) in waves; report
 *            connect latency percentiles, throughput, server RSS delta.
 *   storm    Reconnect storm: connect N, drop ALL sockets at once (engine
 *            close, same as a network partition), then measure full recovery
 *            with the production jittered-backoff settings. With --requeue,
 *            sockets that were "searching" re-emit start_matching after
 *            reconnect and we verify the server answers (queue re-entry or
 *            active-match replay).
 *   match    Phase 3 matchmaking latency: P pairs start simultaneously;
 *            measure emit(start_matching) -> match_found for every socket.
 *
 * Usage:
 *   node scripts/load-sockets.mjs connect --sockets 2000 --users 200
 *   node scripts/load-sockets.mjs storm    --sockets 1000 --users 100 --requeue
 *   node scripts/load-sockets.mjs match    --pairs 50
 *
 * Requires a running backend (API_URL/WS_URL, default localhost:3000).
 * Registers its own throwaway users through the public API.
 */
import 'dotenv/config';
import { io } from 'socket.io-client';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const API = process.env.API_URL || 'http://localhost:3000';
const WS = process.env.WS_URL || 'http://localhost:3000';

const args = process.argv.slice(2);
const mode = args[0] && !args[0].startsWith('--') ? args[0] : 'connect';
function opt(name, dflt) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return dflt;
  const v = args[i + 1];
  return v && !v.startsWith('--') ? Number(v) : dflt;
}
const flag = (name) => args.includes(`--${name}`);

const SOCKETS = opt('sockets', 2000);
const USERS = opt('users', 200);
const HOLD_S = opt('hold', 8);
const PAIRS = opt('pairs', 50);
const WAVE = opt('wave', Math.max(50, Math.ceil(SOCKETS / 20)));
const WAVE_DELAY_MS = opt('wave-delay', 100);

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};

async function registerUsers(n) {
  const tokens = [];
  const batch = 3; // SQLite serializes writes; keep contention low
  for (let i = 0; i < n; i += batch) {
    await Promise.all(
      Array.from({ length: Math.min(batch, n - i) }, async (_, j) => {
        const k = i + j;
        const email = `load-${Date.now()}-${k}@load.test`;
        // SQLite write-lock contention can surface as transient 5xx; retry.
        for (let attempt = 1; ; attempt++) {
          const res = await fetch(`${API}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              username: `load${k}x${Date.now() % 100000}`,
              password: 'Password1!',
              confirmPassword: 'Password1!',
            }),
          });
          if (res.ok) { tokens.push((await res.json()).token); return; }
          const body = await res.text();
          if (attempt >= 5) throw new Error(`register failed: ${res.status} ${body}`);
          await new Promise((r) => setTimeout(r, attempt * 400));
        }
      }),
    );
  }
  return tokens;
}

function serverPid() {
  try {
    const out = execSync("ss -ltnp 2>/dev/null | grep ':3000' | head -1", { encoding: 'utf8' });
    const m = out.match(/pid=(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
function serverRssMb(pid) {
  if (!pid) return null;
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const m = status.match(/VmRSS:\s+(\d+) kB/);
    return m ? Math.round((Number(m[1]) / 1024) * 10) / 10 : null;
  } catch {
    return null;
  }
}

function connectSocket(token, opts = {}) {
  return io(WS, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    reconnectionAttempts: Infinity,
    ...opts,
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
async function runConnect() {
  console.log(`[connect] registering ${USERS} users...`);
  const tokens = await registerUsers(USERS);
  const pid = serverPid();
  const rssBefore = serverRssMb(pid);
  console.log(`[connect] opening ${SOCKETS} sockets in waves of ${WAVE}...`);

  const sockets = [];
  const latencies = [];
  let errors = 0;
  const t0 = Date.now();

  for (let i = 0; i < SOCKETS; i += WAVE) {
    const wave = [];
    for (let j = i; j < Math.min(i + WAVE, SOCKETS); j++) {
      const s = connectSocket(tokens[j % tokens.length]);
      sockets.push(s); // object identity — reconnects never re-push
      const start = Date.now();
      wave.push(
        new Promise((resolve) => {
          const to = setTimeout(() => { errors++; resolve(); }, 15000);
          s.once('connect', () => { clearTimeout(to); latencies.push(Date.now() - start); resolve(); });
          s.once('connect_error', () => { clearTimeout(to); errors++; resolve(); });
        }),
      );
    }
    await Promise.all(wave);
    if (i + WAVE < SOCKETS) await sleep(WAVE_DELAY_MS);
  }
  const elapsed = (Date.now() - t0) / 1000;
  const connected = sockets.length;
  console.log(`[connect] connected ${connected}/${SOCKETS} in ${elapsed.toFixed(1)}s  (errors: ${errors})`);
  console.log(`[connect] connect latency ms  p50=${pct(latencies, 50)}  p95=${pct(latencies, 95)}  max=${Math.max(...latencies, 0)}`);
  console.log(`[connect] throughput ${(connected / elapsed).toFixed(0)} conn/s`);

  // App-level heartbeat RTT sample (server heartbeat -> pong).
  const sample = sockets.slice(0, 25);
  const rtts = [];
  await Promise.all(
    sample.map(
      (s) =>
        new Promise((resolve) => {
          const t = Date.now();
          const to = setTimeout(resolve, 5000);
          s.once('pong', () => { clearTimeout(to); rtts.push(Date.now() - t); resolve(); });
          s.emit('heartbeat');
        }),
    ),
  );
  console.log(`[connect] heartbeat RTT ms  p50=${pct(rtts, 50)}  p95=${pct(rtts, 95)} (n=${rtts.length})`);

  await sleep(HOLD_S * 1000);
  const rssAfter = serverRssMb(pid);
  if (rssBefore && rssAfter) {
    console.log(`[connect] server RSS  before=${rssBefore}MB  after=${rssAfter}MB  delta=${(rssAfter - rssBefore).toFixed(1)}MB  per-conn=${(((rssAfter - rssBefore) * 1024) / Math.max(connected, 1)).toFixed(1)}KB`);
  }
  console.log(`[connect] fd limits  client soft=${softNoFile()}  server=${serverNoFile(pid)}`);

  for (const s of sockets) s.disconnect();
  const ok = connected >= SOCKETS * 0.99;
  return { mode, connected, SOCKETS, errors, elapsed, p50: pct(latencies, 50), p95: pct(latencies, 95), rssBefore, rssAfter, ok };
}

function softNoFile() {
  try {
    return execSync('ulimit -n', { shell: '/bin/bash', encoding: 'utf8' }).trim();
  } catch { return '?'; }
}
function serverNoFile(pid) {
  if (!pid) return '?';
  try {
    return readFileSync(`/proc/${pid}/limits`, 'utf8').match(/open files\s+(\d+)/)?.[1] || '?';
  } catch { return '?'; }
}

// ---------------------------------------------------------------------------
async function runStorm() {
  console.log(`[storm] registering ${USERS} users (1 socket per user for clean attribution)...`);
  const tokens = await registerUsers(USERS);
  const pid = serverPid();
  const rssBefore = serverRssMb(pid);

  const n = Math.min(SOCKETS, USERS);
  const sockets = [];
  for (let i = 0; i < n; i += WAVE) {
    const wave = [];
    for (let j = i; j < Math.min(i + WAVE, n); j++) {
      const s = connectSocket(tokens[j]);
      sockets.push(s);
      s.__connects = 0;
      s.on('connect', () => { s.__connects++; });
      s.__answers = [];
      s.on('matching_queue', () => s.__answers.push({ ev: 'matching_queue' }));
      s.on('match_found', (d) => s.__answers.push({ ev: 'match_found', replay: !!d.replay }));
      wave.push(new Promise((resolve, reject) => {
        const to = setTimeout(() => reject(new Error('connect timeout')), 20000);
        s.once('connect', () => { clearTimeout(to); resolve(); });
        s.on('connect_error', (e) => { clearTimeout(to); reject(e); });
      }));
    }
    await Promise.all(wave);
    if (i + WAVE < n) await sleep(WAVE_DELAY_MS);
  }
  console.log(`[storm] ${sockets.length} sockets up (1/user).`);

  const searchers = sockets.filter((_, i) => i % 2 === 1); // half search; no partners -> all wait
  for (const s of searchers) s.emit('start_matching', {});
  await sleep(1500);
  const waiting = (await fetch(`${API}/health`).then(() => true).catch(() => false)) ? 'ok' : 'no';
  console.log(`[storm] ${searchers.length} searchers queued (waiting state: ${waiting}).`);

  async function dropAndRecover(label) {
    const dropAt = Date.now();
    for (const s of sockets) { s.__recoveredAt = 0; s.__connectsSeen = s.__connects; s.io.engine.close(); }
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline && sockets.some((s) => !s.__recoveredAt)) await sleep(200);
    const recovery = sockets.map((s) => s.__recoveredAt - dropAt).filter((v) => v > 0);
    console.log(`[storm:${label}] recovered ${recovery.length}/${sockets.length}  ms p50=${pct(recovery, 50)} p95=${pct(recovery, 95)} max=${Math.max(...recovery, 0)}`);
    return recovery;
  }
  // record recovery timestamps per socket
  for (const s of sockets) {
    s.on('connect', () => { if (!s.__recoveredAt && s.__connects > (s.__connectsSeen ?? 1)) s.__recoveredAt = Date.now(); });
  }

  // ---- STORM 1: drop everyone; on reconnect the searchers re-enter the
  // queue (exactly what MatchingService does in the Angular client).
  console.log(`[storm] STORM 1: dropping all ${sockets.length} sockets...`);
  await dropAndRecover('storm1');
  for (const s of searchers) { s.__answers = []; s.emit('start_matching', {}); }
  {
    // SQLite serializes writes — under storm load answers can trickle in
    // well past a fixed window. Wait adaptively (cap 30s) for accuracy.
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && searchers.some((s) => s.__answers.length === 0)) await sleep(500);
  }
  const answered1 = searchers.filter((s) => s.__answers.length > 0).length;
  const fresh1 = searchers.filter((s) => s.__answers.some((a) => a.ev === 'match_found' && !a.replay)).length;
  const queue1 = searchers.filter((s) => s.__answers.some((a) => a.ev === 'matching_queue')).length;
  console.log(`[storm:storm1] searchers answered ${answered1}/${searchers.length} (queue-reentry=${queue1} fresh-pair=${fresh1})`);

  // ---- STORM 2: drop everyone again; ALL sockets re-enter. The storm-1
  // searchers now have ACTIVE matches -> the server must REPLAY them
  // (Phase 2 reconnect replay) instead of re-queueing into a second match.
  console.log(`[storm] STORM 2: dropping all again...`);
  await dropAndRecover('storm2');
  for (const s of sockets) { s.__answers = []; s.emit('start_matching', {}); }
  {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && sockets.some((s) => s.__answers.length === 0)) await sleep(500);
  }
  const answered2 = sockets.filter((s) => s.__answers.length > 0).length;
  const replays = searchers.filter((s) => s.__answers.some((a) => a.ev === 'match_found' && a.replay)).length;
  const answeredEvens = sockets.filter((_, i) => i % 2 === 0).filter((s) => s.__answers.length > 0).length;
  console.log(`[storm:storm2] all answered ${answered2}/${sockets.length}  searchers-replayed=${replays}/${searchers.length}  evens-answered=${answeredEvens}/${sockets.length - searchers.length}`);

  const rssAfter = serverRssMb(pid);
  if (rssBefore && rssAfter) console.log(`[storm] server RSS  before=${rssBefore}MB  after=${rssAfter}MB`);
  // Semantics: after storm1, only the searchers that FORMED a match (fresh1)
  // are in active calls — those must be REPLAYED in storm2. Searchers still
  // in the queue legitimately re-join and may pair fresh with the evens who
  // also start matching in storm2.
  const ok = answered1 >= searchers.length * 0.99 && replays >= fresh1 * 0.95 && answeredEvens >= (sockets.length - searchers.length) * 0.95;
  return { mode, sockets: sockets.length, answered1, fresh1, queue1, answered2, replays, answeredEvens, ok };
}

// ---------------------------------------------------------------------------
async function runMatch() {
  const n = PAIRS * 2;
  console.log(`[match] registering ${n} users for ${PAIRS} pairs...`);
  const tokens = await registerUsers(n);
  const sockets = [];
  for (let i = 0; i < n; i++) {
    const s = connectSocket(tokens[i]);
    sockets.push(s);
  }
  await Promise.all(sockets.map((s) => new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('connect timeout')), 20000);
    s.on('connect', () => { clearTimeout(to); res(); });
    s.on('connect_error', (e) => { clearTimeout(to); rej(e); });
  })));
  console.log(`[match] ${sockets.length} sockets connected. Starting simultaneously...`);

  const latencies = [];
  const pending = new Map();
  const t0 = Date.now();
  for (const s of sockets) {
    pending.set(s.id, true);
    s.on('match_found', () => {
      if (!pending.get(s.id)) return;
      pending.set(s.id, false);
      latencies.push(Date.now() - t0);
      if ([...pending.values()].every((v) => !v)) done();
    });
    s.emit('start_matching', {});
  }

  let done;
  const allMatched = new Promise((resolve) => { done = resolve; });
  const timedOut = await Promise.race([allMatched.then(() => false), sleep(30000).then(() => true)]);
  const matched = latencies.length;
  console.log(`[match] matched ${matched}/${n} sockets in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (latencies.length) {
    console.log(`[match] match_found latency ms  p50=${pct(latencies, 50)}  p95=${pct(latencies, 95)}  max=${Math.max(...latencies)}`);
  }
  const unmatched = timedOut ? [...pending.entries()].filter(([, v]) => v).length : 0;
  if (unmatched) console.log(`[match] UNMATCHED sockets after 30s: ${unmatched}`);
  for (const s of sockets) s.emit('cancel_matching'), s.disconnect();
  return { mode, n, matched, unmatched, p50: pct(latencies, 50), p95: pct(latencies, 95), max: Math.max(...latencies, 0), ok: matched === n };
}

// ---------------------------------------------------------------------------
try {
  let result;
  if (mode === 'connect') result = await runConnect();
  else if (mode === 'storm') result = await runStorm();
  else if (mode === 'match') result = await runMatch();
  else throw new Error(`unknown mode: ${mode}`);
  console.log('RESULT ' + JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(1);
}

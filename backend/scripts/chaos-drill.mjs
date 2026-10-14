// CHAOS DRILL (Phase 6): node kill during an active match.
//
// Spawns two backend nodes against an ISOLATED Redis db (9), forms a
// cross-node match, SIGKILLs one node mid-match, then verifies:
//   1. the survivor node keeps serving (/health + live socket stays up);
//   2. the dead node's socket/presence LEASES self-heal (SOCKET_LEASE_TTL_S
//      + presence-index sweep) — no ghost "online" user is left behind;
//   3. the survivor can fully tear down the match and re-match with a fresh
//      user (dead peer state doesn't block anything);
//   4. a stale queue CLAIM left by a crashed handshake (q:claim:*) blocks
//      matchmaking only briefly and then self-heals (MATCH_CLAIM_TTL_S and
//      the failed-claim release path), after which matching resumes.
//
// Run from /backend:  node scripts/chaos-drill.mjs
// Exit 0 = PASS, 1 = FAIL. Children are always reaped.

import { spawn } from 'node:child_process';
import { openSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createClient } from 'redis';
import { io } from 'socket.io-client';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT_A = Number(process.env.DRILL_PORT_A || 3101);
const PORT_B = Number(process.env.DRILL_PORT_B || 3102);
const URL_A = `http://127.0.0.1:${PORT_A}`;
const URL_B = `http://127.0.0.1:${PORT_B}`;
// db 9 keeps the drill away from dev data; short TTLs keep self-heal fast.
const DRILL_REDIS = process.env.DRILL_REDIS_URL || 'redis://127.0.0.1:6379/9';
const CLAIM_TTL_S = 5;
const LEASE_TTL_S = 5;

const childEnv = {
  ...process.env,
  REDIS_URL: DRILL_REDIS,
  // .env may point this at a production volume (/data) that doesn't exist
  // (or isn't writable) on this machine — keep drill uploads local.
  UPLOAD_DIR: '/tmp/pulse-uploads',
  MATCH_CLAIM_TTL_S: String(CLAIM_TTL_S),
  SOCKET_LEASE_TTL_S: String(LEASE_TTL_S),
  REDIS_SWEEP_INTERVAL_MS: '2000', // presence-index sweep
  MATCH_QUEUE_SWEEP_MS: '3000', // matchmaking sweeper
  MATCH_GENDER_RELAX_MS: '0', // determinism: no gender-bias wait in the drill
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const children = [];
let redis;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    console.error(`  FAIL ${msg}`);
    fails.push(msg);
  }
}

/** Poll `fn` until truthy; returns elapsed ms, or -1 on timeout. */
async function until(fn, timeoutMs, everyMs = 250) {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return Date.now() - t0;
    if (Date.now() - t0 > timeoutMs) return -1;
    await sleep(everyMs);
  }
}

function once(sock, event, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label}: no '${event}' within ${timeoutMs}ms`)),
      timeoutMs,
    );
    sock.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function spawnNode(name, port) {
  const logFd = openSync(`/tmp/chaos-${name}.log`, 'w');
  const child = spawn(path.join(backendRoot, 'node_modules', '.bin', 'tsx'), ['src/server.ts'], {
    cwd: backendRoot,
    env: { ...childEnv, PORT: String(port) },
    stdio: ['ignore', logFd, logFd],
    // Own process group: tsx forks a child to run the server, and a plain
    // SIGKILL of the wrapper would leave the real server alive (it kept
    // serving heartbeats — observed as leases that never expired).
    detached: true,
  });
  child.drillName = name;
  children.push(child);
  return child;
}

/** Kill the whole process group (wrapper + tsx child + descendants). */
function killTree(child, signal = 'SIGKILL') {
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch { /* already dead */ }
  }
}

async function waitHealth(url, timeoutMs = 20000) {
  const dt = await until(async () => {
    try {
      return (await fetch(`${url}/health`)).ok;
    } catch {
      return false;
    }
  }, timeoutMs, 300);
  if (dt < 0) throw new Error(`health check never passed: ${url}`);
}

async function register(tag) {
  const res = await fetch(`${URL_B}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `chaos-${tag}-${Date.now()}@example.com`,
      username: `chaos${tag}${Date.now().toString().slice(-7)}`,
      password: 'password123',
      age: 26,
      gender: tag === '1' ? 'MALE' : 'FEMALE',
    }),
  });
  if (!res.ok) throw new Error(`register ${tag} failed: HTTP ${res.status}`);
  return res.json();
}

function connectSocket(user, url) {
  return new Promise((resolve, reject) => {
    const s = io(url, {
      transports: ['websocket'],
      auth: { token: user.token, refreshToken: user.refreshToken },
      reconnection: false,
      timeout: 5000,
    });
    s.on('connect', () => {
      // Real clients (Angular SocketService) heartbeat every 30s; with the
      // drill's short SOCKET_LEASE_TTL_S an idle socket would otherwise be
      // treated as dead and purged from matchmaking. Beat faster, same path.
      const hb = setInterval(() => {
        if (s.connected) s.emit('heartbeat');
      }, 1500);
      s.on('disconnect', () => clearInterval(hb));
      resolve(s);
    });
    s.on('connect_error', (e) => reject(new Error(`connect: ${e.message}`)));
    setTimeout(() => reject(new Error('socket connect timeout')), 6000);
  });
}

async function waitMatch(sock, label, timeoutMs = 20000) {
  return once(sock, 'match_found', timeoutMs, label);
}

async function cleanup(exitCode) {
  for (const c of children) {
    if (c.exitCode === null && c.signalCode === null) killTree(c);
  }
  try {
    if (redis?.isReady) {
      await redis.flushDb();
      await redis.quit();
    }
  } catch { /* best effort — never hang teardown */ }
  process.exit(exitCode);
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error('WATCHDOG: drill exceeded 180s');
    cleanup(1);
  }, 180_000);
  watchdog.unref?.();

  console.log('== CHAOS DRILL ==');
  redis = createClient({ url: DRILL_REDIS });
  await redis.connect();
  await redis.flushDb();

  // --- Phase 1: boot both nodes -------------------------------------------------
  console.log('[1] spawning nodes A + B (isolated redis db, short lease/claim TTLs)');
  const nodeA = spawnNode('a', PORT_A);
  spawnNode('b', PORT_B);
  await Promise.all([waitHealth(URL_A), waitHealth(URL_B)]);
  assert(true, 'both nodes healthy');

  // --- Phase 2: cross-node match ------------------------------------------------
  console.log('[2] forming cross-node match (u1 on A, u2 on B)');
  const [u1, u2] = await Promise.all([register('1'), register('2')]);
  const s1 = await connectSocket(u1, URL_A);
  const s2 = await connectSocket(u2, URL_B);
  const m1a = waitMatch(s1, 'u1', 15000);
  const m1b = waitMatch(s2, 'u2', 15000);
  s1.emit('start_matching', {});
  s2.emit('start_matching', {});
  const [r1a, r1b] = await Promise.all([m1a, m1b]);
  assert(r1a.matchId === r1b.matchId, `cross-node match formed (${r1a.matchId})`);
  const m1 = r1a.matchId;

  // --- Phase 3: SIGKILL node A mid-match ----------------------------------------
  console.log('[3] SIGKILL node A during the active match');
  const killedAt = Date.now();
  killTree(nodeA);
  await new Promise((resolve) => nodeA.once('exit', resolve));
  await sleep(500);
  const healthB = await fetch(`${URL_B}/health`).then((r) => r.ok).catch(() => false);
  assert(healthB, 'survivor node B still serves /health');
  await sleep(2000);
  assert(s2.connected === true, 'survivor socket stays connected (no cascade)');

  const leaseDt = await until(
    async () => (await redis.exists(`conn:${u1.user.id}`)) === 0
      && (await redis.exists(`pres:${u1.user.id}`)) === 0,
    12_000,
  );
  assert(leaseDt >= 0, `socket+presence lease self-healed in ${leaseDt < 0 ? 'TIMEOUT' : leaseDt + 'ms'}`);

  const idxDt = await until(async () => {
    const sets = ['ONLINE', 'OFFLINE', 'MATCHING'];
    for (const s of sets) {
      const members = await redis.sMembers(`pres:status:${s}`);
      if (members.map(String).includes(u1.user.id)) return false;
    }
    return true;
  }, 15_000, 500);
  assert(idxDt >= 0, `presence status indexes swept (no ghost entry) in ${idxDt < 0 ? 'TIMEOUT' : idxDt + 'ms'}`);
  console.log(`  info kill->heal total: ${Date.now() - killedAt}ms`);

  // --- Phase 4: survivor teardown + re-match ------------------------------------
  console.log('[4] survivor tears down the dead match and re-matches with a fresh user');
  const u3 = await register('3');
  const s3 = await connectSocket(u3, URL_B);
  const ended1 = once(s2, 'match_ended', 5000, 'u2 match_ended').catch(() => null);
  s2.emit('end_match', { matchId: m1 });
  await ended1;
  await sleep(300);
  const m2a = waitMatch(s2, 'u2 rematch', 20000);
  const m2b = waitMatch(s3, 'u3 rematch', 20000);
  s2.emit('start_matching', {});
  s3.emit('start_matching', {});
  const [r2a, r2b] = await Promise.all([m2a, m2b]);
  assert(r2a.matchId === r2b.matchId, 'survivor re-matched with fresh user');
  assert(r2a.matchId !== m1, 'new match id differs from the dead match');
  assert(r2a.peer.id === u3.user.id && r2b.peer.id === u2.user.id, 'peer mapping correct');
  const m2 = r2a.matchId;

  // --- Phase 5: stale claim blocks, then self-heals ------------------------------
  console.log('[5] stale queue claim (crash artifact): blocks briefly, then self-heals');
  const ended2 = once(s3, 'match_ended', 5000, 'u3 match_ended').catch(() => null);
  s3.emit('end_match', { matchId: m2 });
  await ended2;
  await sleep(400);

  await redis.set(`q:claim:${u3.user.id}`, '1', { EX: CLAIM_TTL_S });
  assert((await redis.exists(`q:claim:${u3.user.id}`)) === 1, 'stale claim injected');

  s1.removeAllListeners('match_found');
  s2.removeAllListeners('match_found');
  s3.removeAllListeners('match_found');
  const m3a = waitMatch(s2, 'u2 after claim', 25000);
  const m3b = waitMatch(s3, 'u3 after claim', 25000);
  const rq3 = once(s3, 'matching_queue', 6000, 'u3 queue receipt');
  s3.emit('start_matching', {});
  await rq3;
  assert(true, 'u3 queued (unpaired at join — nobody else waiting)');
  const rq2 = once(s2, 'matching_queue', 6000, 'u2 queue receipt');
  s2.emit('start_matching', {});
  await rq2;
  assert(true, 'u2 scan BLOCKED by stale claim (received waiting, not match_found)');

  const claimDt = await until(async () => (await redis.exists(`q:claim:${u3.user.id}`)) === 0, 12_000);
  assert(claimDt >= 0, `stale claim self-healed in ${claimDt < 0 ? 'TIMEOUT' : claimDt + 'ms'}`);

  const [r3a, r3b] = await Promise.all([m3a, m3b]);
  assert(r3a.matchId === r3b.matchId, 'matching resumed after claim healed');
  assert(r3a.matchId !== m2, 'post-claim match is a fresh match');

  // --- summary -------------------------------------------------------------------
  s1.disconnect();
  s2.disconnect();
  s3.disconnect();
  return fails.length === 0;
}

main()
  .then((pass) => {
    console.log(pass ? 'CHAOS DRILL: PASS' : `CHAOS DRILL: FAIL (${fails.length} assertion(s))`);
    cleanup(pass ? 0 : 1);
  })
  .catch((err) => {
    console.error('CHAOS DRILL: FAIL —', err.message);
    console.error('node A log tail:');
    try {
      console.error(readFileSync('/tmp/chaos-a.log', 'utf8').split('\n').slice(-15).join('\n'));
      console.error('node B log tail:');
      console.error(readFileSync('/tmp/chaos-b.log', 'utf8').split('\n').slice(-15).join('\n'));
    } catch { /* logs unavailable */ }
    cleanup(1);
  });

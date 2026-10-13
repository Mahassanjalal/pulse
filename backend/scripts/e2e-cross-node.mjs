// E2E: two clients -> register -> socket connect (with refreshToken) ->
// start_matching -> both receive match_found from the Redis-backed queue.
import { io } from 'socket.io-client';

const API_A = process.env.API_A || 'http://localhost:3000';
const API_B = process.env.API_B || 'http://localhost:3001';
// With API_A != API_B the two users land on DIFFERENT backend nodes — the
// pairing then proves the shared Redis queue + cross-node adapter delivery.
const API = API_A;
const results = { matched: 0, errors: [] };

async function register(tag) {
  const res = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `e2e-${tag}-${Date.now()}@example.com`,
      username: `e2e${tag}${Date.now().toString().slice(-7)}`,
      password: 'password123',
      age: 25 + (tag === 'a' ? 0 : 3),
      gender: tag === 'a' ? 'MALE' : 'FEMALE',
    }),
  });
  if (!res.ok) throw new Error(`register ${tag} failed: ${res.status}`);
  return res.json();
}

function connectSocket(token, refreshToken, url = API_A) {
  return new Promise((resolve, reject) => {
    const s = io(url, {
      transports: ['websocket'],
      auth: { token, refreshToken },
      reconnection: false,
      timeout: 5000,
    });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(new Error('connect: ' + e.message)));
    setTimeout(() => reject(new Error('connect timeout')), 6000);
  });
}

const waitMatch = (sock, name) => new Promise((resolve, reject) => {
  sock.on('match_found', (d) => resolve(d));
  sock.on('error', (e) => results.errors.push(`${name}: ${JSON.stringify(e)}`));
  setTimeout(() => reject(new Error(`${name} got no match_found in 30s`)), 30000);
});

try {
  const [ua, ub] = await Promise.all([register('a'), register('b')]);
  console.log('registered:', ua.user.username, '+', ub.user.username);

  const sa = await connectSocket(ua.token, ua.refreshToken, API_A);
  const sb = await connectSocket(ub.token, ub.refreshToken, API_B);
  console.log('both sockets connected');

  // Create the match promises FIRST (no await), then emit, then await.
  const ma = waitMatch(sa, 'A');
  const mb = waitMatch(sb, 'B');
  sa.emit('start_matching', {});
  sb.emit('start_matching', {});

  const res = await Promise.all([ma, mb]);
  console.log('MATCH A:', res[0].matchId, 'peer:', res[0].peer.displayName);
  console.log('MATCH B:', res[1].matchId, 'peer:', res[1].peer.displayName);

  if (res[0].matchId !== res[1].matchId) throw new Error('match ids differ!');
  if (res[0].peer.id !== ub.user.id || res[1].peer.id !== ua.user.id) throw new Error('peer mapping wrong');

  // Second phase: skip must free both users for immediate re-matching (H-fix verification).
  const ma2 = waitMatch(sa, 'A2');
  const mb2 = waitMatch(sb, 'B2');
  sa.emit('skip_match', { matchId: res[0].matchId });
  await new Promise((r) => setTimeout(r, 400));
  sa.emit('start_matching', {});
  sb.emit('start_matching', {});
  const res2 = await Promise.all([ma2, mb2]);
  console.log('REMATCH OK after skip:', res2[0].matchId === res2[1].matchId);

  console.log('E2E RESULT: PASS');
  sa.disconnect(); sb.disconnect();
  process.exit(0);
} catch (e) {
  console.error('E2E RESULT: FAIL —', e.message, results.errors);
  process.exit(1);
}

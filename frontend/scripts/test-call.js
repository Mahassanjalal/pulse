const { io } = require('socket.io-client');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const WS = 'http://localhost:3000';
const API = 'http://localhost:3000/api/v1';
const mkClient = (token) => io(WS, { auth: { token }, transports: ['websocket'], forceNew: true });
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const decode = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString());

async function regLogin(displayName) {
  const email = displayName.toLowerCase() + '@test.com';
  await fetch(API + '/auth/register', { method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ email, username: displayName, displayName, password: 'Password123' }) }).catch(()=>{});
  const res = await fetch(API + '/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ email, password: 'Password123' }) });
  return (await res.json()).token;
}

async function main() {
  const [t1, t2] = [await regLogin('Alice'), await regLogin('Bob')];
  const u1 = decode(t1).userId, u2 = decode(t2).userId;
  console.log('u1', u1, 'u2', u2);

  // Create mutual friendship directly in DB.
  await prisma.friend.create({ data: { senderId: u1, receiverId: u2 } });
  console.log('friendship created');

  const c1 = mkClient(t1), c2 = mkClient(t2);
  const got = { c1: {}, c2: {} };
  for (const [c, name] of [[c1,'c1'],[c2,'c2']]) {
    ['match_found','incoming_call','call_initiated','call_error','call_declined','call_cancelled','webrtc_offer','error']
      .forEach(ev => c.on(ev, d => { got[name][ev]=(got[name][ev]||0)+1; console.log(`[${name}] ${ev}`, JSON.stringify(d).slice(0,140)); }));
  }
  await new Promise(r => { let n=0; const d=()=>{ if(++n===2) r(); }; c1.on('connect',d); c2.on('connect',d); });
  console.log('--- connected ---');

  console.log('=== call u1 -> u2 ===');
  c1.emit('call_friend', { friendId: u2 });
  await wait(1200);
  console.log('incoming_call c2:', got.c2.incoming_call||0, '| call_initiated c1:', got.c1.call_initiated||0, '| call_error c1:', got.c1.call_error||0);

  // extract callId from c1 call_initiated
  // We didn't capture payload id; re-emit warning. Instead accept via raw listener:
  let callId = null;
  c1.on('call_initiated', d => { callId = d.callId; });
  c1.emit('call_friend', { friendId: u2 }); // triggers again, but already in call -> error. Instead reuse.
  await wait(300);

  console.log('=== accept (using captured callId) ===');
  if (callId) {
    c2.emit('accept_call', { callId });
    await wait(1500);
    console.log('match_found c1:', got.c1.match_found||0, '| match_found c2:', got.c2.match_found||0);
  } else {
    console.log('NO callId captured');
  }

  await wait(200);
  c1.close(); c2.close();
  await prisma.$disconnect();
  process.exit(0);
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1); });

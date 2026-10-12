import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { authenticate, getAuthUser } from '../middleware/auth';

/**
 * TURN credential minting (audit M9).
 *
 * The frontend previously shipped a hardcoded, shared, public relay credential
 * (openrelay) — dead at best, an open abuse relay at worst. In production we
 * run our own coturn with `static-auth-secret` and mint SHORT-LIVED HMAC
 * credentials per user here. Clients call this endpoint after authenticating
 * and use the returned username/credential in their RTCConfiguration.
 *
 * Configure:
 *   TURN_URLS=turn:turn.example.com:3478,turn:turn.example.com:3478?transport=tcp
 *   TURN_STATIC_AUTH_SECRET=<same as coturn static-auth-secret>
 *   TURN_CREDENTIAL_TTL_SECONDS=3600   (optional, default 1h)
 */
export default async function webrtcRoutes(app: FastifyInstance) {
  app.get('/turn-credentials', { preHandler: authenticate }, async (req, reply) => {
    const authUser = getAuthUser(req)!;
    const urls = (process.env.TURN_URLS || '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    const secret = process.env.TURN_STATIC_AUTH_SECRET;

    if (!urls.length || !secret) {
      // No TURN configured (dev) — the client falls back to its bundled STUN
      // list. Never fabricate credentials.
      return { configured: false, iceServers: [] };
    }

    const ttl = Number(process.env.TURN_CREDENTIAL_TTL_SECONDS || 3600);
    const expiry = Math.floor(Date.now() / 1000) + ttl;
    // coturn REST API convention: username = "<expiry>:<userId>",
    // credential = base64(HMAC-SHA1(username, secret)).
    const username = `${expiry}:${authUser.id}`;
    const credential = crypto
      .createHmac('sha1', secret)
      .update(username)
      .digest('base64');

    return {
      configured: true,
      ttl,
      iceServers: [
        ...urls.filter((u) => u.startsWith('stun:')).map((u) => ({ urls: u })),
        {
          urls: urls.filter((u) => u.startsWith('turn:')),
          username,
          credential,
        },
      ],
    };
  });
}

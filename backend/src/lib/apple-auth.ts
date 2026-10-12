import crypto from 'crypto';

/**
 * Server-side verification for "Sign in with Apple" identity tokens.
 *
 * The previous implementation base64-decoded the JWT payload WITHOUT checking
 * the signature, which let anyone forge an Apple identity and take over any
 * Apple-linked account (audit finding C2). This module verifies:
 *   - RS256 signature against Apple's published JWKS (https://appleid.apple.com/auth/keys)
 *   - `iss` = https://appleid.apple.com
 *   - `aud` = the configured APPLE_CLIENT_ID
 *   - `exp` in the future
 *
 * Uses only node:crypto — no extra dependency. Keys are fetched on demand,
 * cached for an hour, and refreshed once if an unknown `kid` is seen (Apple
 * rotates keys occasionally).
 */

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const JWKS_TTL_MS = 60 * 60 * 1000;

interface CachedKey {
  kid: string;
  key: crypto.KeyObject;
  fetchedAt: number;
}

let jwksCache: CachedKey[] | null = null;
let jwksInFlight: Promise<CachedKey[]> | null = null;

function b64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

async function loadJwks(force = false): Promise<CachedKey[]> {
  if (!force && jwksCache && jwksCache.length > 0 && Date.now() - jwksCache[0]!.fetchedAt < JWKS_TTL_MS) {
    return jwksCache;
  }
  if (!force && jwksInFlight) return jwksInFlight;

  jwksInFlight = (async () => {
    const res = await fetch(APPLE_JWKS_URL);
    if (!res.ok) throw new Error(`Apple JWKS fetch failed: ${res.status}`);
    const body = (await res.json()) as { keys: any[] };
    const keys: CachedKey[] = (body.keys || [])
      .filter((k) => k.kty === 'RSA' && k.kid)
      .map((k) => ({
        kid: k.kid,
        key: crypto.createPublicKey({ key: { kty: k.kty, n: k.n, e: k.e }, format: 'jwk' }),
        fetchedAt: Date.now(),
      }));
    if (!keys.length) throw new Error('Apple JWKS contained no RSA keys');
    jwksCache = keys;
    return keys;
  })();

  try {
    return await jwksInFlight;
  } finally {
    jwksInFlight = null;
  }
}

export function invalidateAppleJwks(): void {
  jwksCache = null;
}

export interface AppleIdentity {
  sub: string;
  email?: string;
  name?: string;
  emailVerified?: boolean;
}

/**
 * Verifies an Apple identity token and returns its claims.
 * Throws on any verification failure — callers must map that to 401.
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  audience: string,
): Promise<AppleIdentity> {
  if (!audience) throw new Error('APPLE_CLIENT_ID is not configured');

  const parts = identityToken.split('.');
  if (parts.length !== 3) throw new Error('Malformed identity token');

  const [headerB64 = '', payloadB64 = '', signatureB64 = ''] = parts;
  let header: any;
  let payload: any;
  try {
    header = JSON.parse(b64urlDecode(headerB64).toString('utf8'));
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new Error('Malformed identity token');
  }

  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('Unsupported token algorithm');
  }

  let keys = await loadJwks();
  let entry = keys.find((k) => k.kid === header.kid);
  if (!entry) {
    // Unknown kid — Apple may have rotated keys since we cached them.
    keys = await loadJwks(true);
    entry = keys.find((k) => k.kid === header.kid);
  }
  if (!entry) throw new Error('Unknown token signing key');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  if (!verifier.verify(entry.key, b64urlDecode(signatureB64))) {
    throw new Error('Invalid token signature');
  }

  if (payload.iss !== APPLE_ISSUER) throw new Error('Invalid token issuer');
  if (payload.aud !== audience) throw new Error('Invalid token audience');
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
    throw new Error('Token expired');
  }
  if (!payload.sub) throw new Error('Token missing subject');

  return {
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
  };
}

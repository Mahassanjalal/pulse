export const environment = {
  production: true,
  apiUrl: '/api/v1',
  // Derive the WebSocket URL from the page origin so real-time features work
  // in production without a hardcoded host. Assumes the API/WS serve from the
  // same origin; override with a value when hosting WS on a separate domain.
  wsUrl: typeof window !== 'undefined' ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}` : '',
  googleClientId: 'YOUR_GOOGLE_CLIENT_ID',
  // TURN relay servers for NAT traversal when STUN-only peer-to-peer fails.
  // Do not commit production secrets here — populate via a build-time replace
  // or a backend-issued token endpoint that mints short-lived credentials.
  // The public openrelay entry is for fallback/dev only.
  turnServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};
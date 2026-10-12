export const environment = {
  production: true,
  apiUrl: '/api/v1',
  apiBase: '',
  // Derive the WebSocket URL from the page origin so real-time features work
  // in production without a hardcoded host. Assumes the API/WS serve from the
  // same origin; override with a value when hosting WS on a separate domain.
  wsUrl: typeof window !== 'undefined' ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}` : '',
  googleClientId: 'YOUR_GOOGLE_CLIENT_ID',
  // Production resolves ICE servers from the backend
  // (/api/v1/webrtc/turn-credentials), which mints short-lived HMAC
  // credentials for our own coturn fleet. The static list below is a STUN-only
  // fallback — the old hardcoded public relay credential was removed (audit M9).
  turnServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};
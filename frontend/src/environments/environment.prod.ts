export const environment = {
  production: true,
  apiUrl: '/api/v1',
  // Derive the WebSocket URL from the page origin so real-time features work
  // in production without a hardcoded host. Assumes the API/WS serve from the
  // same origin; override with a value when hosting WS on a separate domain.
  wsUrl: typeof window !== 'undefined' ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}` : '',
  googleClientId: 'YOUR_GOOGLE_CLIENT_ID',
  // TURN relay servers for NAT traversal. Populate via a build-time replace or
  // a backend-issued token endpoint; do not commit real credentials here.
  turnServers: [
    // { urls: 'turn:turn.example.com:3478', username: 'temp-user', credential: 'temp-pass' },
  ],
};
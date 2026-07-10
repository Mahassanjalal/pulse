export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api/v1',
  wsUrl: 'http://localhost:3000',
  // Get this from https://console.cloud.google.com/apis/credentials
  // Create an OAuth 2.0 Client ID for a Web application, add http://localhost:4200 to Authorized JavaScript origins
  googleClientId: 'YOUR_GOOGLE_CLIENT_ID',
  // TURN relay servers for NAT traversal when STUN-only peer-to-peer fails
  // (e.g. both peers behind symmetric NAT / same host). These are public,
  // credential-free relays for local/dev testing. For production, mint
  // short-lived TURN credentials from a backend token endpoint instead of
  // hardcoding shared secrets here.
  turnServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};
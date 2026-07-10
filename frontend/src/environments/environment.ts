export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api/v1',
  wsUrl: 'http://localhost:3000',
  // Get this from https://console.cloud.google.com/apis/credentials
  // Create an OAuth 2.0 Client ID for a Web application, add http://localhost:4200 to Authorized JavaScript origins
  googleClientId: 'YOUR_GOOGLE_CLIENT_ID',
  // TURN relay servers (optional). Provide an array of RTCIceServer configs
  // for NAT traversal when STUN-only peer-to-peer fails. Credentials should be
  // short-lived tokens minted by a backend endpoint, not committed secrets.
  turnServers: [
    // { urls: 'turn:turn.example.com:3478', username: 'temp-user', credential: 'temp-pass' },
  ],
};
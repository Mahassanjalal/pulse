const fs = require('fs');
const path = require('path');

// Copies the built Angular SPA (frontend/dist/pulse) into backend/public so the
// backend can serve it from the same origin as the API in production.
const src = path.join(__dirname, '..', 'frontend', 'dist', 'pulse');
const dest = path.join(__dirname, '..', 'backend', 'public');

if (!fs.existsSync(src)) {
  console.error(`[copy-frontend] Angular build output not found at ${src}. Run the frontend build first.`);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`[copy-frontend] Copied SPA from ${src} -> ${dest}`);

#!/usr/bin/env node
/**
 * pglite-wire.mjs — run a real Postgres (PGlite, in WASM) behind the
 * PostgreSQL wire protocol so Prisma can connect to it with a normal
 * DATABASE_URL, with zero system installs.
 *
 * This is the *local verification* path for the Postgres provider when you
 * don't have a Postgres server available (CI, sandboxes, laptops). Production
 * and docker-compose setups should use a real Postgres — see infra/docker-compose.yml.
 *
 * Usage:
 *   npm i -D @electric-sql/pglite @electric-sql/pglite-socket   # once
 *   node scripts/pglite-wire.mjs                                 # listens on 5544
 *   DATABASE_URL=postgres://postgres@127.0.0.1:5544/postgres?connection_limit=1 npm run dev
 *
 * IMPORTANT: keep `connection_limit=1`. The PGlite socket multiplexer only
 * completes one connection handshake at a time — Prisma opens an extra
 * connection during Promise.all at the default pool size and the dropped
 * handshake surfaces as P1001/P1017. Real Postgres needs no such limit.
 *
 * The pglite packages are resolved from PGLITE_ENV (a directory containing
 * their node_modules) and fall back to this package's own node_modules —
 * so a plain `npm i -D` makes it work with no extra configuration.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const PORT = Number(process.env.PGLITE_PORT || 5544);
const HOST = process.env.PGLITE_HOST || '127.0.0.1';
const DATA_DIR = process.env.PGLITE_DATA || ''; // '' = in-memory (fresh each run)

async function load(specifier) {
  const candidates = [];
  if (process.env.PGLITE_ENV) {
    candidates.push(path.join(process.env.PGLITE_ENV, 'package.json'));
  }
  candidates.push(path.join(process.cwd(), 'package.json'));
  let lastErr;
  for (const pkgJson of candidates) {
    if (!fs.existsSync(pkgJson)) continue;
    try {
      const req = createRequire(pkgJson);
      const resolved = req.resolve(specifier);
      return await import(pathToFileURL(resolved).href);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Cannot resolve ${specifier}. Install it with:\n` +
      `  npm i -D @electric-sql/pglite @electric-sql/pglite-socket\n` +
      `or point PGLITE_ENV at a directory that has it.` + (lastErr ? `\n(${lastErr.message})` : '')
  );
}

const { PGlite } = await load('@electric-sql/pglite');
const { PGLiteSocketServer } = await load('@electric-sql/pglite-socket');

const db = DATA_DIR ? await PGlite.create({ dataDir: DATA_DIR }) : await PGlite.create();
const server = new PGLiteSocketServer({ db, host: HOST, port: PORT });
await server.start();
console.log(`[pglite-wire] real Postgres (WASM) listening on postgres://${HOST}:${PORT}/postgres${DATA_DIR ? ` data=${DATA_DIR}` : ' (in-memory)'}`);

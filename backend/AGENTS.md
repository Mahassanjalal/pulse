# Backend AGENTS.md — Pulse API

Scope: `/backend`. For product context see root `AGENTS.md`. This file is authoritative when working in this folder.

## Stack
Node.js + TypeScript (CommonJS). **Fastify v5**, **Prisma v5** (SQLite `prisma/dev.db`), **Socket.IO v4**, **Zod v4**, **argon2**, **@fastify/jwt**, **Stripe v17** (optional), **google-auth-library**, **Pino**.

## Scripts
- `npm run dev` — tsx watch `src/server.ts` (port 3000)
- `npm run build` — tsc; `npm start` — node `dist/server.js`
- `npm run generate` / `migrate` / `push` / `studio` — Prisma
- `npm run seed` — demo data (`src/seed.ts`)
- `npm test` — Vitest
- Swagger UI at `http://localhost:3000/docs`

## Layout
```
src/
  server.ts          # bootstrap: CORS, JWT, logger, swagger, routes, socket, error handler
  seed.ts            # 8 demo users + sample conversation + friend request
  routes/            # auth, users, matches, chat, friends, notifications, reports, premium, admin (Fastify plugins, prefix /api/v1)
  middleware/
    auth.ts          # authenticate preHandler, getAuthUser, AuthUser type
  plugins/
    request-logger.ts# correlationId per request, req/resp/error logging
  socket/
    handlers.ts      # live matching engine, WebRTC signaling, in-match chat, presence
  lib/
    prisma.ts        # PrismaClient singleton
    validators.ts    # Zod schemas (Register/Login/UpdateProfile/.../CreateReport)
    notifications.ts  # NotificationService + isBlocked()
    user.ts          # withRealCounts() recomputes friend/conversation counts
    stripe.ts        # optional Stripe client (null when STRIPE_SECRET_KEY empty)
    errors.ts        # ApiError, sendError
  types/
    fastify.d.ts     # augments FastifyInstance with `io`
```

## Auth model
- Access JWT (15m) signed with `JWT_SECRET`; refresh token stored in `RefreshToken` table (7d).
- `authenticate` preHandler → `req.authUser` (`AuthUser`: id, email, username, displayName, isPremium, isVerified, role).
- Login methods: email/password (argon2), Google OAuth (`/auth/google`, auto-links by email), guest (`/auth/guest`, 1h token). Phone/OTP NOT implemented.
- Roles: `USER` | `ADMIN` | `MODERATOR`. Admin routes use `requireAdmin`.

## Domain rules (enforced)
- Friend requests (send & accept) are **premium-only** (`isPremium` check in `friend.ts` + socket `add_friend`).
- Non-premium matching is ~75% same-gender biased; premium users may supply `filters`.
- `isBlocked(a,b)` excludes blocked pairs from matching/messaging/friend requests (mutual).
- `withRealCounts()` should be used whenever returning `friendsCount`/`totalConversations` (columns are stale).
- Privacy: `privacySettings` (hideAge/hideCountry/hideOnlineStatus/hideProfilePicture/privateProfile) gates `GET /users/:id` output.
- Premium: `grantPremium()` sets `isPremium` + `premiumUntil`; dev-mode (no Stripe key) grants directly.

## Matching engine (socket/handlers.ts)
- `waitingUsers: Map<userId, {socketId, filters?>`; `activeMatches: Map<matchId, {user1,user2,matchId,startTime}>`.
- On `start_matching`: set status MATCHING, scan waiting pool, skip blocked / gender-mismatch, create `Match` (status ACTIVE), emit `match_found` to both with peer profile + mutual interests (parsed from JSON `interests` arrays).
- WebRTC: relay `webrtc_offer/answer/candidate` to the peer in the match.
- In-match chat: persist `Message`, emit `match_message` to peer + `match_message_sent` to sender.
- `skip_match`/`end_match`: update Match (status/duration, increment `totalConversations` on END), notify peer.
- Presence: join `user_{id}` room; broadcast `presence_changed` to friends on online/offline; multi-tab `userConnections` map; `heartbeat` (90s timeout) keeps `lastSeen` fresh.

## DB notes
- Provider: SQLite. Relations use `onDelete: Cascade` (deleting a user cascades most child rows).
- `languages`/`interests` stored as JSON strings — parse before use.
- Enums are plain `String` columns (e.g., gender MALE/FEMALE/NON_BINARY/PREFER_NOT_TO_SAY; report categories NUDITY/HARASSMENT/.../OTHER; match status PENDING/ACTIVE/ENDED/SKIPPED).

## Conventions
- New route file → add to `routes/index.ts` with a `/api/v1/<group>` prefix and `export default async function`.
- Protect with `{ preHandler: authenticate }`; read user via `getAuthUser(req)`.
- Validate bodies with Zod schemas in `lib/validators.ts`; on failure Zod throws → global handler returns 500 (consider catching to return 400).
- Emit realtime via `req.server.io.to(\`user_${id}\`).emit(...)`.
- Return errors as `{ error: 'message' }`.

## Gotchas
- Stripe webhook needs raw body — captured by the custom `application/json` parser in `server.ts` into `req.rawBody`.
- `friendsCount`/`totalConversations` columns are denormalized & often wrong; prefer `withRealCounts`.
- `AuthInterceptor` on frontend auto-refreshes on 401 using `/auth/refresh`.
- Don't commit `.env`; template is `.env.example`.

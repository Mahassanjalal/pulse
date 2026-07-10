# AGENTS.md — Pulse (Project Context for Autonomous Agents)

> This file gives an autonomous coding agent everything it needs to understand, navigate, and extend the **Pulse** codebase. Read it before making changes. It is intentionally authoritative; when it conflicts with stray comments or older docs, this file wins (unless a more specific `AGENTS.md` in a subfolder says otherwise).

---

## 1. Purpose

**Pulse** is a random video-chat / social-discovery platform that instantly connects strangers worldwide for one-on-one video conversations. Think Omegle-style matching, but with a modern, gamified, retention-focused product: profiles, friends, messaging, interests, reputation, coins/rewards, premium tiers, moderation, and a rich animated UI.

**Current state:** The product is a **functional MVP**. The backend is real and wired to a database (matching, auth, chat, premium all work end-to-end via REST + WebSockets). The frontend is a complete **Angular 16** SPA that mostly consumes **mock/in-memory data** in some services but **does** talk to the real backend through `AuthService`, `SocketService`, `MatchingService`, and `ChatService`. The two halves are partially integrated: auth, live matching, and in-match chat work against the real API; other pages still render seeded/mock data.

**Headline product goals:** near-instant matchmaking, high-quality low-latency video, strong safety/moderation, personalization, and engagement (coins, streaks, achievements, leaderboards, premium).

---

## 2. Monorepo Layout

```
pulse/
├── backend/        # Fastify + Prisma + Socket.IO API  (real, production-shaped)
├── frontend/       # Angular 16 SPA (dark glassmorphism UI)
├── README.md       # Product spec / feature list (the "what should exist" doc)
└── .commandcode/   # Agent config / learned taste (do not edit)
```

Two independent npm projects. There is **no shared workspace tooling** — run backend and frontend separately. See `backend/AGENTS.md` and `frontend/AGENTS.md` for folder-level details.

---

## 3. Tech Stack (at a glance)

**Backend (`/backend`)**
- **Runtime:** Node.js, CommonJS, TypeScript (via `tsx` in dev, `tsc` for build)
- **Server:** Fastify v5
- **DB / ORM:** SQLite + Prisma v5 (file: `prisma/dev.db`)
- **Auth:** `@fastify/jwt`, argon2 password hashing, refresh tokens in DB
- **Realtime:** Socket.IO v4 (WebSockets only) for matching, WebRTC signaling, in-match chat, presence
- **Validation:** Zod v4
- **Payments:** Stripe v17 (optional; dev-mode fallback grants premium without keys)
- **Social login:** Google OAuth (`google-auth-library`)
- **Logging:** Pino + pino-pretty
- **Docs:** `@fastify/swagger` + swagger-ui at `/docs`
- **Tests:** Vitest

**Frontend (`/frontend`)**
- **Framework:** Angular 16 (NgModule-based, not standalone), TypeScript 5.1
- **Styling:** Tailwind CSS 3 + custom SCSS (`styles.scss`)
- **State:** RxJS `BehaviorSubject` in singleton services (no NgRx)
- **Forms:** Template-driven `FormsModule`
- **WebGL/Canvas:** Custom GLSL shader (`shader-bg.directive.ts`) + Canvas particle system (`particles-bg.directive.ts`) — no external graphics libs
- **Realtime client:** `socket.io-client`
- **Animation:** CSS `@keyframes` + Angular `@HostListener` micro-interactions
- **Tests:** Karma + Jasmine

---

## 4. How the Two Halves Connect

| Concern | Backend | Frontend |
|---|---|---|
| REST API base | `http://localhost:3000/api/v1` | `environment.apiUrl` |
| Realtime | Socket.IO on same server (WS) | `SocketService` (`environment.wsUrl`) |
| Auth | JWT (15m access) + refresh token | `AuthService` stores tokens in `localStorage`, `AuthInterceptor` adds `Bearer` + auto-refreshes on 401 |
| Env URLs (dev) | `FRONTEND_URL=http://localhost:4200` | `apiUrl=http://localhost:3000/api/v1`, `wsUrl=http://localhost:3000` |

**CORS** is open to `FRONTEND_URL`. **Stripe webhook** needs raw body — handled by a special `application/json` content-type parser in `server.ts` that captures `req.rawBody`.

---

## 5. Backend Architecture (summary)

- **Entry:** `src/server.ts` — registers CORS, JWT, request-logger, Swagger, all route groups via `registerRoutes`, mounts the Stripe webhook, boots Socket.IO, and sets a global error handler with correlation IDs.
- **Routes** (`src/routes/`, prefix `/api/v1`): `auth`, `users`, `matches`, `chat`, `friends`, `notifications`, `reports`, `premium`, `admin`. Each file default-exports an async Fastify plugin.
- **Middleware** (`src/middleware/auth.ts`): `authenticate` preHandler (verifies JWT, loads user into `req.authUser`), `getAuthUser`, `AuthUser` type.
- **Lib** (`src/lib/`): `prisma.ts` (client), `validators.ts` (Zod schemas), `notifications.ts` (`NotificationService` + `isBlocked`), `user.ts` (`withRealCounts` recomputes friend/conversation counts), `stripe.ts` (optional client), `errors.ts` (`ApiError`, `sendError`).
- **Socket** (`src/socket/handlers.ts`): the live matching engine (`waitingUsers` map, `activeMatches` map), WebRTC signaling relay, in-match chat, presence broadcast, multi-tab connection tracking, heartbeat (90s timeout).
- **Seed:** `src/seed.ts` creates 8 demo users + a sample conversation + a friend request.

### Key Domain Rules (enforced in code)
- **Friend requests are premium-only** (checked in `friend.ts` and socket `add_friend`).
- **Matching** is gender-biased for non-premium users (~75% same-gender). Premium users may pass match `filters`.
- **Blocked users** are mutually excluded from matching, messaging, and friend requests (`isBlocked`).
- **Counters** (`friendsCount`, `totalConversations`) are denormalized and often stale; `withRealCounts()` recomputes them from relations.
- **Privacy:** `privacySettings` (hide age/country/status/picture, private profile) filter what `GET /users/:id` returns.
- **Premium** via `grantPremium()` setting `isPremium` + `premiumUntil`; Stripe optional — empty `STRIPE_SECRET_KEY` → dev-mode direct grant.

### REST Endpoints (quick reference)
```
GET    /health
/auth/google, /auth/register, /auth/login, /auth/refresh, /auth/logout,
/auth/me, /auth/guest, /auth/change-password, /auth/account (DELETE)
/users/:id, /users/search, /users/discover, /users/me/dashboard,
/users/me/profile (PATCH), /users/me/settings, /users/me/preferences,
/users/me/visitors, /users/:id/mutual-friends, /users/:id/status,
/users/block, /users/block/:id
/matches/start, /matches/cancel, /matches/:id/end, /matches/history
/chat/conversations (GET/POST/DELETE), /chat/messages/:matchId (GET),
/chat/messages (POST), /chat/messages/:id/read
/friends, /friends/requests, /friends/request, /friends/requests/:id/accept|reject,
/friends/:id, /friends/:id/favorite
/notifications, /notifications/:id/read, /notifications/read-all, /notifications/:id
/reports, /reports/my-reports, /reports/:id/cancel
/premium/plans, /premium/subscription, /premium/create-checkout,
/premium/checkout-status, /premium/subscribe, /premium/cancel, /premium/webhook
/admin/users, /admin/users/:id/role|verify, /admin/reports,
/admin/reports/:id/review|resolve, /admin/stats
```

### Socket.IO Events
**Client → Server:** `heartbeat`, `presence_sync`, `start_matching`, `cancel_matching`, `webrtc_offer/answer/candidate`, `send_match_message`, `typing`, `skip_match`, `end_match`, `add_friend`.
**Server → Client:** `matching_queue`, `match_found`, `match_skipped`, `match_ended`, `matching_cancelled`, `presence_changed`, `presence_sync_result`, `pong`, `webrtc_*`, `match_message`, `match_message_sent`, `peer_typing`, `friend_request_notification`.

---

## 6. Frontend Architecture (summary)

- **Root:** `app.component.ts` switches between three layouts — `public` (landing/auth/about), `authenticated` (header+sidebar+bottom-nav), `video-chat` (fullscreen). Layout is driven by route `data.layout`.
- **Core** (`core/`): singleton services (`AuthService`, `ChatService`, `MatchingService`, `NotificationService`, `SocketService`, `WebRTCService`) + guards (`AuthGuard`, `GuestGuard`, `PremiumGuard`) + `AuthInterceptor` (auto token refresh).
- **Models** (`models/user.model.ts`): `User` interface + sub-types.
- **Shell** (`shell/`): `header`, `sidebar`, `bottom-nav`, `sidebar-toggle`, `video-chat-shell`.
- **Shared** (`shared/`): `plan-list` component (reused by premium page + modal) + 2 directives (`shader-bg`, `particles-bg`). All exported from `SharedModule`. (Legacy one-off components were removed; the premium plan rendering is centralized in `PlanListComponent`.)
- **Features** (`features/`): 14 lazy-loaded modules, each `module.ts` + `page.ts` + `page.html` (external templates). Routes: `/`, `/login`, `/register`, `/dashboard`, `/messages`, `/friends`, `/profile`, `/profile/:id`, `/video`, `/discover`, `/settings`, `/premium`, `/about`, `/notifications`, `/admin`; `**` → `/dashboard`. `/admin` is guarded by `AdminGuard`.
- **Design system:** dark obsidian base (`#131314`), brand magenta (`#f7acff` / `#e14aff`) + neon cyan (`#00eefc`), glassmorphism utilities, Montserrat/Inter fonts, Material Symbols icons. Tokens live both in `tailwind.config.js` and CSS custom properties in `styles.scss`.

**Integration status:** All core services (`AuthService`, `SocketService`, `MatchingService`, `ChatService`, `NotificationService`, `WebRTCService`, `AdminService`) are wired to the real backend. The backend emits real-time `notification`, `friend_request_accepted`, and `friend_added` socket events that the frontend subscribes to.

---



## 7. Conventions (follow these)

- **Backend:** feature-route files under `src/routes/`; protect routes with `{ preHandler: authenticate }`; use `getAuthUser(req)`; validate input with the Zod schemas in `lib/validators.ts`; return `{ error: '...' }` shapes; use `req.server.io` to emit socket events.
- **Frontend:** lazy-loaded feature modules; external HTML templates (no inline); shared UI goes in `shared/` + `SharedModule`; global chrome in `shell/`; singleton logic in `core/services`; no `border-radius` on sidebar nav items; RxJS `BehaviorSubject` for state (no NgRx).
- **Auth headers:** never hardcode; use `environment.apiUrl` + the interceptor.
- **Secrets:** never commit real values — use `.env` (gitignored) with `.env.example` as the template.
- **Migrations:** Prisma. After schema changes: `npm run migrate` (dev) and `npm run generate`.

---

## 8. Common Commands

```bash
# Backend (from /backend)
npm install
cp .env.example .env          # then fill in (Google/Stripe optional)
npm run generate              # prisma client
npm run migrate               # apply migrations (or: npm run push)
npm run seed                  # demo data
npm run dev                   # tsx watch on :3000
npm run build && npm start    # prod
npm test                      # vitest
# API docs at http://localhost:3000/docs

# Frontend (from /frontend)
npm install
npx ng serve --port 4200     # dev (expects backend on :3000)
npx ng build --configuration production
npx ng test                  # karma/jasmine
```

---

## 9. Plans / Roadmap (what's left to build)

These are the gaps between the spec (`README.md`) and the current code. Prioritize by product impact.

**Backend**
1. **Phone / OTP auth** — `loginWithPhone`, `sendOtp`, `verifyOtp` are unimplemented on both sides.
2. **Password reset & account recovery** — endpoints do not exist yet.
3. **Coins & rewards engine** — daily reward exists; achievements, leaderboards, gifts, profile boosts, super-likes are not implemented.
4. **Admin panel UI** — `/admin/*` API exists; no frontend admin screens.
5. **AI moderation** — content detection, fake/bot detection, automatic warnings/banning are not built.
6. **WebRTC media servers** — signaling exists; no TURN/STUN config or SFU for scale.
7. **Real-time notifications** — `NotificationService` persists; frontend still uses mock `NotificationService`.
8. **Push/email** notifications, analytics events, announcement/banner/FAQ CMS.

**Frontend**
1. **Wire remaining services to the API** — `NotificationService` (use `/notifications`), `WebRTCService` (use `SocketService` + `getUserMedia`), friend/system flows.
2. **Replace remaining mock data** in dashboard, discover, friends, messages, notifications, settings, profile, premium with real API calls + loading/error states.
3. **Video-chat page** — full WebRTC peer connection (`WebRTCService` stub), effects/blur, screenshare.
4. **Premium checkout** — call `/premium/create-checkout`, handle Stripe redirect + `checkout-status`.
5. **Settings** — persist to `/users/me/settings` & `/users/me/preferences`; account deletion; block-list management UI.
6. **Admin module** — new lazy feature module consuming `/admin/*`.
7. **Search / discover filters** — pass premium match `filters` through `MatchingService`.
8. **Tests** — add Karma specs; backend Vitest coverage for services.
9. **i18n / accessibility** — localization and a11y pass for global audience.

**Cross-cutting**
- Consistent error handling UX (toasts) on frontend.
- Production env config (`environment.prod.ts` has placeholder `wsUrl`/Google IDs).
- CI (lint + build + test) for both packages.
- Deploy story (DB migrations, Stripe live keys, CORS for prod domains).

---

## 10. Gotchas

- **`friendsCount`/`totalConversations` are stale** — always recompute via `withRealCounts` before trusting them.
- **Stripe is optional** — empty key → premium is granted directly (dev mode). Don't assume a real payment flow in local testing.
- **Socket auth** uses `socket.handshake.auth.token`; mismatch with REST `Bearer` token format is fine (both JWT).
- **Frontend `premium` route is NOT guarded** by `PremiumGuard` despite the guard existing — intentional (it's the upsell page).
- **`/profile/:id` has no `canActivate: [AuthGuard]`** (only `data.layout`) — verify this is intended before adding guard.
- **Windows paths** — this repo runs on win32; prefer cross-platform commands.
- **Don't edit `.commandcode/`** (taste/learned prefs are managed automatically).

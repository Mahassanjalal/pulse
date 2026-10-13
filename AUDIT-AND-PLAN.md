# Pulse — Full Audit, Scaling Plan & Competitive Roadmap

> Full-system review of the Pulse codebase (Fastify + Prisma/SQLite + Socket.IO backend, Angular 16 frontend) against a target of **500,000 concurrent users**, benchmarked against Azar, HOLLA, OmeTV, Chatrandom, Emerald Chat, Chatroulette, Monkey, LivU and Paltalk (2025–26 product research).
>
> Date: 2026-10-12 (Phase 0) / 2026-10-13 (Phases 1–3) · Status: **Phase 0 (security) + Phase 1 (data layer: Postgres + Redis) + Phase 2 (horizontal realtime) + Phase 3 (matching engine rewrite) IMPLEMENTED** (see implementation logs below).

## Implementation log (2026-10-12, this session)

**All C-tier criticals and the majority of H/M-tier findings are fixed in code, with regression tests.**

### Fixed — critical
- **C1** OTP code no longer returned in production (`auth-extra.ts`): codes are SMS-sent via Twilio when configured, 503 otherwise; dev-only reveal behind `DEV_AUTH_FALLBACK`; OTPs stored **hashed** (SHA-256), constant-time compare, single-use, rate-limited (per-IP + per-phone). The same leak in `/auth/forgot-password` (reset token returned unconditionally) was fixed the same way.
- **C2** Apple sign-in now verifies RS256 signatures against Apple's JWKS + `iss`/`aud`/`exp` (`lib/apple-auth.ts`, no new deps).
- **C3** `/premium/subscribe` returns 403 when Stripe is configured (dev-only path).
- **C4** New `PaymentEvent` idempotency table (`lib/payments.ts`): checkout-status polls verify session ownership (`metadata.userId === caller`) and can grant **once per session**; the Stripe webhook claims the **event id** first, so retries/double-delivery can't double-credit.
- **C5** `POST /moderation/unlock` gated to dev mode (403 in production); unlock-status verifies session ownership + purpose.
- **C6** Reports: rate-limited (10/h), deduped per reporter/target/24h, target must exist, and a lock now requires **≥2 distinct safety-category reporters (or ≥5 other-category) within 24h** — never a single report. Locked accounts get an appeal-oriented message; admins retain unlock.
- **C7** The `/video` page now has always-visible **Report (with category modal) and Block** buttons wired to `/reports` + `/users/block` (`report.service.ts`); reporting/blocking leaves the call immediately.

### Fixed — high
- **H3** Schema migration `20261012085858_audit_security_and_indexes`: 15 new indexes (Match, Message, Notification, Report, Friend, FriendRequest, BlockedUser, LoginHistory, ProfileView, CoinTransaction, User(status/trustScore/premiumUntil)).
- **H4** Message pagination rewritten as keyset over `(createdAt, id)` with base64url cursors; `limit` clamped to 100.
- **H5** Unread counts via a single `groupBy` (previously always 0/1).
- **H6** `/chat/messages/:id/read` now only marks messages where the caller is the receiver.
- **H7** Socket handshake accepts a refresh token and re-authenticates expired access tokens server-side; the Angular `SocketService` sends it and refreshes over HTTP on `connect_error` before retrying.
- **H8** `revokeExpiredPremium()` sweep runs at boot + daily.
- **H9** Daily reward is a single conditional transaction (claim-guarded `updateMany` + ledger row inside), streak math switched to UTC calendar days (DST-safe).
- **H10** `skip_match` returns both users to ONLINE; `cancel_matching` won't clobber an in-match status.
- **H11** A secondary tab's disconnect no longer un-queues the primary tab (queue entry is socket-scoped).
- **H12** `adjustCoins` is now one atomic guarded `UPDATE ... WHERE coins + amount >= 0` + ledger insert in a transaction (Postgres-safe).
- **H13** `MatchingService` clears the BehaviorSubject on end/skip/cancel — no stale-peer replay.
- **H14** The `/video` page ignores `match_found` during direct friend calls and no longer tears down the shared WebRTC singleton on destroy during a call.
- **H15** `/auth/guest` disabled in production unless `ENABLE_GUEST_LOGIN=true`; rate-limited 5/h per IP.
- **H16** Register/Google/Apple/phone-provisioning races map unique violations to retries/409 instead of 500.
- **New (found during fix)** — `claimedUsers` were never released after a successful match: after one completed/skipped match **both users could never match again** until reload. Claims are now released after the handshake, on skip/end, and on errors (`try/catch` re-queue).

### Fixed — medium (selected)
- **M1** Global `@fastify/rate-limit`; Socket.IO `maxHttpBufferSize` 100 KB; socket `send_match_message` validated with `SendMessageSchema` + per-user rate limit.
- **M2** New-message notifications only on the first unread per conversation.
- **M3** Typing events throttled per socket (400 ms).
- **M4** Heartbeat `lastSeen` DB writes throttled to ≤1/min per socket.
- **M6** Conversation delete is a per-user soft hide (`Match.deletedFor`); peer history and moderation evidence preserved.
- **M9** `GET /webrtc/turn-credentials` mints time-limited coturn HMAC credentials; the frontend fetches/caches them; the hardcoded public relay removed from `environment.prod.ts`.
- **M11** `lockAccount` now kicks all live sockets and purges queue/pending calls via `lib/realtime.ts` hooks.
- **M12** Refresh tokens rotate (single-use) and expired rows are purged; password reset invalidates all sessions.
- **M13** Achievement unlock create-race maps P2002 to the update path.
- **M14** Swagger hidden in production unless `SWAGGER_ENABLED=true`; CORS allowlist (`FRONTEND_URL` + `APP_ORIGINS`).
- **M17** `trustProxy: true` so `req.ip` (rate limits/audit) uses X-Forwarded-For from the LB.
- **New** — `POST /friends/requests/:id/reject` had no ownership check (any user could reject any request): now recipient-only; accept double-click race resolved; leaderboard `limit` clamped to 50.

### Verified
- `tsc --noEmit` clean (backend); `vitest`: **28/28 tests pass** (14 existing + 14 new security/atomic-ledger tests).
- Live smoke against SQLite: register (incl. duplicate→409), login, refresh-rotation (old token → 401 on reuse), guest (dev), OTP dev flow.
- Migration applied via `prisma migrate dev`.

## Implementation log (2026-10-13, Phase 1 — data layer)

**Postgres + Redis are wired in and verified live end-to-end, including two server nodes pairing users across a shared Redis queue.** The committed default remains SQLite (`scripts/use-db.sh` flips providers) so local dev is unchanged.

### Shipped — realtime state + multi-node
- **State store abstraction** (`src/lib/state/`): `queue` (waiting users), `active matches`, `pending calls`, `socket registry` and presence/leases now go through one `StateStore` interface with two implementations — **memory** (default, identical to previous single-node behavior, used by tests/dev) and **Redis** (enabled by `REDIS_URL`). Durable records stay in Postgres/SQLite; ephemeral state moves out of process.
- **Socket.IO Redis adapter** (`@socket.io/redis-adapter`) wired in `server.ts` with graceful fallback to the local adapter when `REDIS_URL` is unset — broadcasts (`match_found`, `presence_changed`, signaling, kicks) now cross nodes.
- **Matching-engine fixes found by the new E2E tests**: a queue **sweeper** (periodic rescan) + **gender-grace widening** so mixed-gender pairs can no longer dead-lock in the queue (previously only the joining user's gender roll was checked and nobody re-scanned); claims released on skip/end/error; in-match status checks now O(1) via the store.
- Heartbeat/presence writes are served from Redis when configured (no per-heartbeat DB writes).

### Shipped — Postgres provider
- `scripts/use-db.sh sqlite|postgres` — provider swap + `prisma generate` (committed schema stays on **sqlite**; deploys/CI switch).
- `prisma/postgres-baseline.sql` — full PG DDL generated from the Prisma schema (`prisma migrate diff --from-empty`), for bootstrapping empty PG databases (Prisma cannot migrate across providers).
- `scripts/copy-sqlite-to-pg.py` — idempotent schema+data migration (FK-safe order, epoch→timestamp + boolean casts, `ON CONFLICT DO NOTHING`).
- `scripts/pglite-wire.mjs` — local verification harness: runs **real Postgres (PGlite/WASM) behind the wire protocol** so the PG path can be tested with no system install. Quirk documented in the script: use `?connection_limit=1` — the PGlite socket multiplexer drops *concurrent* connection handshakes, and Prisma opens a 2nd connection during `Promise.all` otherwise.
- The Phase-0 atomic coin update and `withRealCounts` queries are already Postgres-safe.

### Infra
- `infra/docker-compose.yml` — Postgres 16 + Redis 7 (+ optional PgBouncer via `--profile pooler`) for staging/production-shaped local runs.

### Verified (live, this session)
- **On Postgres (PGlite wire) + Redis**: register → login → `/auth/me` → dashboard (multi-table `Promise.all`) → notifications, rapid ×5 (single-conn pool stable), duplicate-register of a **migrated** row → 409 (pre-existing SQLite data visible), 49 rows migrated from `dev.db`.
- **Socket E2E on that stack**: two real clients matched, skipped, re-matched (`scripts/e2e-match.mjs` → PASS).
- **Cross-node**: two separate server processes sharing only Redis pair users across nodes and deliver `match_found` cross-node (`scripts/e2e-cross-node.mjs` → PASS); store conformance suite runs against memory **and** real Redis (same tests, both green).

## Implementation log (2026-10-13, Phases 2+3 — realtime scale + matching engine)

**Reconnect storms and the matching engine are now production-shaped: native ping/pong liveness, jittered client reconnect with queue re-entry + active-match replay, a Redis sorted-set priority queue with atomic claims, premium lanes, fairness widening, and abuse rate limits — all measured live (load harness + E2E + cross-node).**

### Shipped — Phase 2 (horizontal realtime)
- **Native Socket.IO ping/pong liveness** (`server.ts`: explicit `pingInterval`/`pingTimeout`, `pingTimeout` floor) replaces the custom 90s heartbeat timeout; the app-level `heartbeat` event now only refreshes freshness data (≤1 DB write/min/socket; liveness goes to Redis).
- **Reconnect-storm hardening (client)**: `SocketService` uses production reconnect settings (jittered backoff `randomizationFactor 0.5`, cap 30s, infinite attempts) and refreshes expired tokens over HTTP on `connect_error`; `MatchingService` re-emits `start_matching` on reconnect — the server answers with either a **queue re-entry** (`matching_queue`) or an **active-match replay** (`match_found` + `replay: true`) so a reconnecting user can never be double-matched or left with a stale "searching" state.
- **Event-drop race fixed (found by the storm test)**: the async Socket.IO `connection` handler awaited `store().addSocket(...)` BEFORE registering listeners, so client events arriving in that window (e.g. an immediate `start_matching` after reconnect) were **silently dropped** — observed as 0/400 answered under storm load. Socket registration now runs in the background (all listeners bind synchronously), with `disconnect` awaiting insertion so removal can never race ahead of it.
- **Silent handler-death fixed**: `start_matching` had uncaught `prisma.user.update` calls outside its try/catch — under SQLite write contention (P1008) the handler died without responding, leaving "searching" UIs stale. The whole handler now has a top-level guard that always answers the client.

### Shipped — Phase 3 (matching engine)
- **Sorted-set priority queue**: the waiting queue moved from an unordered hash scan to a **Redis sorted set scored by join time with a premium head start** (both stores implement it; memory store models data/ranking separately to match Redis semantics exactly). Scanners walk the fairest candidate first; FIFO fairness means nobody can be starved by arbitrary hash order.
- **Atomic claim-dequeue**: `claimWaitingUser` is a Lua script in Redis (and an atomic op in memory) — two nodes can never claim the same waiting user; claims carry **TTL leases** so a crashed node can't poison the queue.
- **Premium lanes**: premium users get a bounded score head start (not unbounded priority), so free users still flow.
- **Fairness/starvation widening**: `tryPairWith` and the periodic queue **sweeper** share one rule set — after a wait threshold, preferences widen (incl. gender-grace) so mixed-preference pairs that could never pair instantly still pair eventually (this also killed the pre-existing mixed-gender deadlock).
- **Per-join scan cap**: each joiner inspects at most 25 candidates (O(1) per join instead of O(queue)); the sweeper covers the remainder — this bounds reconnect-storm re-join cost.
- **Abuse rate limits (3c)**: matchmaking/requeue budget 20/min per user (generous enough for honest reconnects, stops hot-loop churn); rapid-skip signal tracking on the store for future trust-score weighting.

### Measured (live, this session — `scripts/load-sockets.mjs`)
- **connect** — 2,000 sockets / 200 users (multi-tab): **2000/2000 connected, 0 errors**, 77 conn/s in waves, connect p50=183ms p95=4.8s (wave-gated), heartbeat RTT p50=7ms p95=10ms, **44.6KB server RAM/conn**, fd limits verified 65535.
- **storm** — 400 sockets, two full drop-everything cycles with requeue: recovery 400/400 both storms (p50≈5–10s with production jittered backoff), **searchers answered 200/200 after storm1** (queue re-entry + fresh pairs), **all answered 400/400 after storm2** (active-match replays + fresh pairs for the still-queued). Before the two fixes above: 56/200 then 0/400 — the harness caught two real server bugs.
- **match** — 50 pairs simultaneous: **100/100 matched**, `match_found` p50=4.3s p95=6.8s; 200 pairs: 400/400 matched, p50=14.3s (SQLite serializes each match's writes; Postgres removes this bottleneck — see Phase 1 log).
- Store conformance suite (41 tests incl. claim-dequeue ordering, premium score ordering, lease TTL) runs against memory **and** real Redis — both green; `e2e-match.mjs` and `e2e-cross-node.mjs` re-verified on the fixed build.

### Still open (needs infra / next phases)
- **Phase 4**: media tier — coturn fleet + per-node TURN credential minting already exists; SFU decision (LiveKit/mediasoup) + simulcast; instrument relay %/ICE failure rate.
- **Phase 5/6**: on-device blur-before-accept, sampled-frame moderation, SLO dashboards, chaos drills (node kill during matches is partially covered by the cross-node tests).
- M5 `/discover` & dashboard trending still sort the whole user table (now indexed; revisit with proper feeds).
- M7 `withRealCounts` per profile view (needs cached counters).
- M10 admin role-value validation.
- M15/M16 privacy review + text moderation filter.
- On-device blur-before-accept and sampled-frame moderation (Phase 5).

---

## PART 1 — Bug & Issue Report

Severity: **C**ritical (exploit / money / auth / safety) · **H**igh (functional correctness) · **M**edium · **L**ow.

### Critical — fix before anything else

| # | Issue | Where | Impact |
|---|---|---|---|
| **C1** | `/auth/send-otp` **returns the OTP code in the response in every environment** (`{ devMode: true, code }` unconditionally). | `backend/src/routes/auth-extra.ts` | **Full account takeover of any phone account**: attacker requests OTP for a victim's number, reads the code from the JSON response, calls `/verify-otp`, owns the account. |
| **C2** | `/auth/apple` **decodes the identity token without signature verification** (base64-decode of the JWT payload only; comment admits it). | `auth-extra.ts` | Forged Apple `sub`/email → takeover of any Apple-linked account. |
| **C3** | `POST /premium/subscribe` **grants premium directly with no payment in production** — no `isStripeConfigured` gate (unlike `create-checkout`). | `routes/premium.ts` | Free premium for anyone with a token; revenue = 0. |
| **C4** | **Infinite coin printing**: `GET /coins/checkout-status` grants `pkg.coins + bonus` on **every call** while the Stripe session is paid (no idempotency), and never checks `session.metadata.userId === authUser.id` (no ownership). Same pattern in `premium/checkout-status` (re-grant re-extends `premiumUntil` each call). Webhook has no `event.id` idempotency → Stripe retries double-credit. | `routes/coins.ts`, `routes/premium.ts` | Unlimited coins/premium; any leaked/guessed `session_id` credits the wrong user. |
| **C5** | `POST /moderation/unlock` unlocks a locked account **with no payment, in all environments** (dev-only route not gated). | `routes/moderation.ts` | The entire $10 unlock monetization + deterrence is bypassable in one request. |
| **C6** | **A single unverified report instantly locks the target's account and demands $10 to unlock.** No rate limit, no dedupe, no report threshold, no admin review, no evidence. | `routes/report.ts` + `lib/moderation.ts` | Trivial weaponization: griefers mass-report to DoS anyone; "pay $10 or stay locked" after an anonymous accusation is extortion-shaped — legal, ethical and store-review poison. |
| **C7** | **No Report/Block controls in the live video UI** (backend APIs exist; the `/video` page exposes none). No panic/quick-exit affordance beyond Skip. | `frontend/.../video-chat.page.html` | Hard blocker for Apple Guideline 1.2 and Google Play UGC + Child Safety Standards — without it the app cannot be distributed. |

### High — functional correctness

| # | Issue | Where | Impact |
|---|---|---|---|
| **H1** | **All realtime state is in-process memory** — `waitingUsers`, `claimedUsers`, `activeMatches`, `pendingCalls`, `pendingCallTimers`, `userConnections`, `heartbeatTimers` Maps; no Socket.IO Redis adapter. `isUserInMatch()` is O(all matches) and called several times per call setup. | `socket/handlers.ts` | Single-node ceiling (~tens of thousands of sockets); **a restart orphans every active match** (no `match_ended` ever emitted, users stuck "in a call"); horizontal scaling impossible. This is the #1 scalability blocker. |
| **H2** | **SQLite + local-disk uploads** as the production datastore (Railway volume). Every heartbeat, presence change and message is a synchronous write; `writeFileSync` for uploads blocks the event loop. | `prisma/schema.prisma`, `lib/storage.ts` | Single-writer bottleneck; multi-node impossible; a 10 MB upload stalls the loop. |
| **H3** | **Only 4 `@@index` in the entire schema.** No index on `Match(user1Id/user2Id/status)`, `Message(matchId)`, `Notification(userId)`, `Report(status/reportedUserId)`, `LoginHistory(userId)`, `ProfileView(viewedUserId)`, `Friend(receiverId)`, `BlockedUser(blockedUserId)`… | `schema.prisma` | Every list/lookup is a full table scan; degrades linearly with user count. |
| **H4** | **Message cursor pagination is broken**: `where.id < cursor` with `orderBy createdAt desc`, but `Message.id` is a **random UUID** — the keyset filter is meaningless → randomly skipped/missing messages. | `routes/chat.ts` | Chat history is silently lossy. Fix: opaque `createdAt|id` cursor (or ULID ids). |
| **H5** | **Unread counts always 0 or 1** — computed from the last 1 message (`take: 1` then filtered). | `routes/chat.ts` `/conversations` | Badges wrong everywhere. Fix: `count`/`groupBy` on unread. |
| **H6** | `POST /chat/messages/:id/read` has **no ownership check** (any user can mark any message read by ID). | `routes/chat.ts` | IDOR; fake read receipts. |
| **H7** | **Socket token is never refreshed** — handshake auth uses the 15-min JWT once; client gives up after 10 reconnect attempts. After token expiry any reconnect fails (`Invalid or expired token`) → realtime silently dead until a full page reload. | `socket.service.ts` + `handlers.ts` | Users "connected but nothing works" after ~15 min + network blip. |
| **H8** | **Premium expiry is never enforced** — `premiumUntil` passes but nothing flips `isPremium` (no job, no check-on-auth). | `routes/premium.ts` | Expired subscribers keep all premium perks forever unless they manually cancel. |
| **H9** | **Daily-reward race**: read-check-then-write without transaction; `adjustCoins` and the streak update are separate transactions → double-claim under parallel requests and partial-failure mismatch; streak logic requires an exact 86,400,000 ms gap → DST/timezones break streaks. | `routes/user.ts` | Free coin farming; streak bugs. |
| **H10** | **Two divergent state machines**: REST `/matches/start|cancel|:id/end` mutate DB status but never touch the socket queue/`activeMatches`; ending a live match via REST leaks the in-memory entry → next call fails with "You are already in a call". `skip_match` never returns the user's status to ONLINE (stays MATCHING). | `routes/match.ts`, `handlers.ts` | Ghost states, stuck users. |
| **H11** | **Multi-tab queue bug**: *any* socket disconnect (including a secondary tab) deletes `userId` from `waitingUsers`, silently un-queuing the still-connected primary tab. | `handlers.ts` | Random "matching never finds anyone" reports. |
| **H12** | **`adjustCoins` lost-update race** — read-modify-write in a transaction with no `SELECT … FOR UPDATE` / optimistic version. Serializes on SQLite today; **breaks the moment you migrate to Postgres**. | `lib/coins.ts` | Lost coin updates, negative balances under concurrency. |
| **H13** | **Stale peer replay**: `MatchingService.matchFound$` (BehaviorSubject) is never cleared after match end; re-entering `/video` replays the previous peer → ghost UI and signaling against a dead `matchId`. | `matching.service.ts` | Confusing ghost matches, server "Match not found" errors. |
| **H14** | **Friend-call vs /video double handling**: both the floating widget and a mounted `/video` page react to every `match_found`; the page never checks `isDirectCall` → `createPeerConnection` runs twice (second replaces first). Page `ngOnDestroy` calls `webRTCService.disconnect()`, **killing an active friend call** on navigation. | `video-chat.page.ts`, `friend-call-widget.component.ts` | Broken direct calls in edge flows; camera left on or call dropped. |
| **H15** | **`/auth/guest` creates a brand-new user row per request** with no rate limit or cleanup; `/auth/send-otp` auto-provisions accounts too. | `routes/auth.ts`, `auth-extra.ts` | DB flooding, fake online counts, matching spam by bots. |
| **H16** | **Register/Google username races** — `findFirst`-then-`create` (no unique-violation handling → 500 instead of 409); Google usernames use a random 4-char suffix that can collide. | `routes/auth.ts` | Sporadic 500s under load. |

### Medium

| # | Issue | Where |
|---|---|---|
| **M1** | **No rate limiting anywhere** (no `@fastify/rate-limit`): login brute force, unauthenticated `/users/search` + `/users/:id` enable full user-DB scraping, OTP bombing, report spam, gift spam. Socket `send_match_message` **doesn't validate at all** (`SendMessageSchema` exists but unused on the socket path) — unbounded content, arbitrary `type`, 1 MB payloads via default `maxHttpBufferSize`. | all routes + `handlers.ts` |
| **M2** | A `Notification` row is created **per message** → write amplification + notification spam. | `routes/chat.ts` |
| **M3** | `typing` falls back to a DB query **per typing event** for REST conversations. | `handlers.ts` |
| **M4** | **Presence/heartbeat write amplification**: heartbeat → `lastSeen` DB write every 30 s per user; presence broadcast does a DB query per connect/disconnect; dashboard counts `status='ONLINE'` over the whole table per load. At 500k users ≈ 16k pointless writes/s. | `handlers.ts`, `routes/user.ts` |
| **M5** | `/discover` and dashboard `trending` re-sort the entire user table (`orderBy trustScore`) per request; user preferences/filters are never applied. | `routes/user.ts` |
| **M6** | `DELETE /chat/conversations/:matchId` **hard-deletes** the match and cascades all messages — destroys moderation evidence and silently nukes the other user's history. | `routes/chat.ts` |
| **M7** | Every profile view does an upsert **plus 2 COUNT queries** (`withRealCounts`) — heavy on hot profiles. | `routes/user.ts`, `lib/user.ts` |
| **M8** | Uploads: local disk, no re-encode/dimension limits/scanning/moderation — malicious or huge-dimension images, single-node only. | `lib/storage.ts` |
| **M9** | TURN: dev env ships a **hardcoded public shared credential** (openrelay — dead/shared); no backend endpoint mints time-limited TURN credentials. | `environment.ts` |
| **M10** | `PUT /admin/users/:id/role` doesn't validate the `role` value (arbitrary strings writable). | `routes/admin.ts` |
| **M11** | **Locking a account doesn't kick live sockets** — locked users keep matching/calling until reconnect; not removed from queue/matches. | `lib/moderation.ts` |
| **M12** | Refresh tokens: no rotation, no reuse detection, expired rows never purged (unbounded growth, 7-day stolen-token window). | `routes/auth.ts` |
| **M13** | `unlockAchievement` `create` races → unique-violation crash under concurrency (needs upsert/catch). | `lib/achievements.ts` |
| **M14** | Swagger `/docs` exposed in production; CORS is a single origin string (no allowlist). | `server.ts` |
| **M15** | `/users/:id` returns the raw `privacySettings` object to any viewer and exposes `trustScore`/`communityRating`; needs a privacy review. | `routes/user.ts` |
| **M16** | No text moderation/profanity filter on in-match chat. | `handlers.ts` |
| **M17** | `x-forwarded-for` read manually without `trustProxy: true` → spoofable IPs (breaks audit + any future rate limiting). | `auth.ts`, `server.ts` |
| **M18** | Guest/phone accounts bypass username rules (`username: phone`), login sets `status: ONLINE` before any socket connects → inflated online counts. | `auth-extra.ts` |

### Low / quality

- **L1** No Angular `OnPush` change detection; message/friend lists render without virtualization → jank on long lists.
- **L2** Test coverage is nearly empty where bugs live: 14 backend unit tests (coins/guards/logic), **zero** tests for socket engine, auth, payments, chat; 1 frontend spec file. The current suite passes but wouldn't catch any C/H issue above.
- **L3** Socket layer uses `console.log` instead of pino; no structured metrics (match latency, queue depth, ICE failure rate, TURN relay %).
- **L4** Custom heartbeat + client 30 s interval vs 90 s timeout is fragile on mobile (timer throttling/bfcache) — prefer Socket.IO native ping/pong.
- **L5** `environment.prod.ts` still has placeholder IDs/URLs (known in AGENTS.md).
- **L6** `/users/search` uses `contains` (LIKE scan) — fine now, needs trigram/FTS + index at scale.

---

## PART 2 — Competitor Comparison (2025–26)

| Product | Scale (claimed) | Core loop | Paid tier | Safety | What they have that Pulse doesn't |
|---|---|---|---|---|---|
| **Azar** | 100M+ DL | Random video + profiles, interests, follows, "Lounge" discovery | Subs + IAP for gender/region filters | 24/7 AI moderation, in-match blur on detection, badge for good behavior | AR effects, voice→subtitle translation, deep profile/social layer |
| **OmeTV** | "hundreds of thousands online" | Swipe-to-skip roulette + couple mode + social profiles/followers | Free (ad-supported) | 24/7 moderators, reports with screenshots, auto-ban after complaints | **Swipe UX**, built-in message translation, couple mode |
| **Chatrandom** | 1M+ DL | Swipe right = next, gender/location filters | IAP | Undisclosed | **Face filters** |
| **HOLLA** | 10M+ DL, "30M users" | 1:1 video + interest matching + voice chat + persistent text w/ stickers/memes | HOLLA Plus (advanced filters) | Safety Center, 24/7 moderation, AI-assisted reporting | Voice-only rooms, sticker/meme culture |
| **Emerald Chat** | "thousands online" | Anonymous text/video + interest rooms + karma | Subs (filters, ad-free) | 24/7 human + AI moderation | **Karma-based trust**, group channels |
| **Chatroulette** | "millions" | **Pick-and-match consent step**, country filters, "top users" | Free + earned "Quids" currency | Automated screening + human review "within minutes", 18+ | **Consent-before-connect**, earned currency, human review SLA |
| **Monkey** | 10M+ DL, "30M users" | Video + swipeable profile Cards + DMs + **Squad group video** | IAP / ads-for-time | 17+ | Group video, profile mood/song, ad-for-time rewarded ads |
| **LivU** | 50M+ DL | 1:1 random + friends/DMs + **virtual gifts**, blur-start | Coins + premium | Blur on start, report/block | Gift economy wired into calls, real-time translation, video filters/stickers |
| **Paltalk** | "millions" | Interest **rooms** (video/voice/text), gifts → XP → achievement levels that **decay with inactivity** | Credits + PC premium | Room-owner moderation tools | The strongest retention loop (XP decay), rooms as community |

**Cross-cutting findings**
1. **Every serious competitor's paid tier is discovery control** (gender/region/interest filters) — Pulse already prices this correctly behind premium.
2. **Safety is the moat, not a cost**: blur-on-connect, AI + human moderation with an SLA, and one-tap in-call report/block are table stakes for stores AND retention.
3. **Translation is the #1 un-copied differentiator** for global matching (Azar/LivU/OmeTV all ship it; Pulse has none).
4. **Consent mechanics** (Chatroulette pick-and-match, LivU blur-start) materially reduce abuse and app-store risk.
5. **No verified Pulse-class competitor uses streaks/dailies as the core loop** — Pulse's coins/streaks/achievements are ahead of most; they need depth (gifts in-call UI, XP decay, battle pass), not replacement.
6. **Mobile-first is the market**: every competitor's center of gravity is the App Store/Play. Pulse is a web SPA — and **Apple clarified in Feb 2026 that random/anonymous chat apps don't belong on the App Store (Guideline 1.2) and may be removed without notice** — a strategic distribution risk that shapes the whole roadmap (see Part 4).

---

## PART 3 — Plan to 500k Concurrent Users

500k connected ≈ **250k simultaneous 1:1 calls**. Media, not the API, dominates cost & complexity. Sources: [LiveKit SFU](https://docs.livekit.io/reference/internals/livekit-sfu/), [mediasoup scalability](https://mediasoup.org/documentation/v3/scalability/), [Socket.IO Redis adapter](https://socket.io/docs/v4/redis-adapter/), [Socket.IO memory](https://socket.io/docs/v4/memory-usage/), [Cloudflare Realtime pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/), [LiveKit pricing](https://livekit.com/pricing), [Daily pricing](https://www.daily.co/pricing/video-sdk/), [coturn](https://github.com/coturn/coturn/wiki/turnserver), [PgBouncer](https://www.pgbouncer.org/config.html), [Redis matchmaking](https://redis.io/tutorials/matchmaking-and-game-session-state-with-redis/), [Hive pricing](https://thehive.ai/pricing), [Sightengine pricing](https://sightengine.com/pricing), [AWS Rekognition pricing](https://aws.amazon.com/rekognition/pricing/).

### Phase 0 — Security & correctness (week 1–2, before any scale work)
1. Fix C1–C7: verify Apple/Google tokens server-side; remove/gate `/premium/subscribe`, `/moderation/unlock`, OTP-code-in-response; make all checkout-status + webhook paths **idempotent** (Stripe `event.id` table; grant-once per `session_id` with ownership check `metadata.userId`); move report→lock behind review + thresholds; add in-call Report/Block/panic UI.
2. Fix H4–H9, H13–H16 (pagination cursor, unread counts, message-read ownership, socket re-auth, premium expiry job, daily-reward transaction, stale peer replay, guest/OTP rate limits).
3. Add `@fastify/rate-limit` (global + per-route), Socket.IO packet validation + `maxHttpBufferSize` cap, `trustProxy`, disable `/docs` in prod.
4. Indexes migration (H3) + soft-delete conversations (M6) + kick sockets on lock (M11).

### Phase 1 — Data layer: Postgres + Redis (week 3–6)
- Migrate Prisma `sqlite → postgres`; **fix `adjustCoins` with `SELECT … FOR UPDATE` (or atomic `UPDATE … SET coins = coins + $x WHERE coins + $x >= 0`) at the same time** — H12 silently breaks on Postgres.
- PgBouncer (transaction pooling) in front of Postgres; read replicas for feeds/history; keep strong consistency for match/billing decisions.
- Move **all ephemeral state** to Redis: presence/lastSeen (batch-flush to PG), heartbeat leases, queue state, active-match registry, in-flight calls. Postgres keeps durable records only.
- Uploads → R2/S3 + CDN (keep local only for dev); sharp-style re-encode on ingest.
- Message ids → ULID (fixes ordering + pagination for good).

### Phase 2 — Horizontal realtime (week 5–8)
- Socket.IO **sharded Redis adapter** (`@socket.io/redis-adapter` over Redis 7+ pub/sub); websocket-only transport (already set) so sticky sessions aren't required, but verify reconnect storms; raise fd/ephemeral-port limits.
- Stateless API/socket nodes behind LB; capacity-test at 10k/20k/40k sockets per node; plan ~25–40 nodes + spare capacity for deploys/surges.
- Replace the custom heartbeat with Socket.IO native ping/pong; store liveness in Redis leases.
- Load-test **reconnect storms**, not just steady state (k6/Artillery + custom WS scenarios).

### Phase 3 — Matching engine rewrite (week 7–10)
- Redis sorted-set queues keyed by region/gender/preference bucket (hot-key avoidance); **atomic dequeue** (Lua / `ZPOPMIN`) so two workers can never claim the same user; TTL/lease per entry so dead clients self-expire.
- Premium priority lanes; widen geographic radius after a wait threshold; fairness to prevent starvation.
- `in-match` as a Redis set (O(1)) replacing the O(n) scan; idempotent match id + explicit **accept stage** before media (see roadmap) + requeue-on-timeout semantics that only requeue still-online users.
- Rate-limit skip/rematch/report; track rapid-skip abuse signals.

### Phase 4 — Media tier (week 9–14)
- Keep **P2P for 1:1** (it's cheap) but make TURN a first-class fallback: self-hosted **coturn fleet with time-limited HMAC credentials** minted by the backend (kill the openrelay hardcode).
- Prepare SFU for group/couple modes and moderation tap-in: **LiveKit Cloud** or **Cloudflare Realtime** (managed) or self-hosted **mediasoup** (cheapest per GB, most ops). Decision gate: benchmark with real call profiles.
- Client: simulcast/`maxBitrate` caps, resolution negotiation (premium = HD, per plan copy), adaptive downlink.
- **Instrument from day one**: relay %, bitrate, call duration, ICE failure rate, bytes by region — these numbers (not "500k users") drive the bill.
- Cost reality (list-price arithmetic, all-day usage): TURN relay for 10–50% of traffic ≈ $0.8M–4M/mo at Cloudflare's $0.05/GB egress; managed SFU per-minute rates ≈ $8–11M/mo at continuous usage (LiveKit list rates) → **enterprise contracts and real session-length distributions are mandatory before commit**. Typical sessions are minutes, not 24/7 — measure, don't extrapolate.

### Phase 5 — Moderation at scale (parallel track, from Phase 0)
- **Client-side first line**: on-device nudity detection that blurs incoming video before render (Apple `SensitiveContentAnalysis` on iOS; an ONNX/TF.js-class model on web). Cheap, private, immediate.
- **Server-side sampled frames** → Hive ($3/1k images), Sightengine ($29/mo 10k ops w/ live-stream moderation) or AWS Rekognition (⚠️ streaming video analysis closed to new customers after Apr 2026) — risk-based sampling (new users, reports against, high trust-score deltas), **not** blanket per-frame sampling (naive 1-frame/5s at 500k cams ≈ **$26k/minute** at Hive list price).
- Human review queue with an SLA (Chatroulette reviews reports "within minutes" — that's the bar); report-weighted trust-score decay; audit trail (already have `recordAudit`).
- Text moderation on all chat paths; repeat-offense escalation ladder (warn → temp mute → lock → ban), removing the "one report = instant $10 lock" model entirely.

### Phase 6 — Reliability & observability (continuous)
- SLOs: match latency p95, signaling delivery, ICE success rate, API p95; dashboards + alerts; correlation IDs already exist — thread them into logs/metrics/traces.
- Chaos drills: node kill during active matches, Redis failover, DB failover, redeploy during peak.
- Backups + point-in-time recovery on Postgres; migration discipline (Prisma Migrate, expand-contract).

### What "done" looks like
- 500k conns across ~30+ stateless nodes, zero in-process state; matching p95 < 1.5 s regionally; no single-node failure loses a match; media regionalized; every payment grant idempotent and owned; moderation triage < 5 min for urgent reports; load tests prove reconnect-storm survival.

---

## PART 4 — Competitive Feature Roadmap

### Now (P0 — required to ship/store-approve at all)
1. **Safety suite**: in-call one-tap Report (with categories incl. *suspected minor*), Block, and Panic-exit; blur-before-accept matching; moderation console w/ SLA; age assurance (18+ only to start) and store compliance artifacts (Google Play Child Safety Standards contact, DSA/OSA risk assessments).
2. **Consent-first matching** (Chatroulette/LivU pattern): blurred preview → both accept → clear video. Cuts abuse and differentiates on safety.
3. **Payments hardening** (C3–C5) — monetization must actually collect.

### Next (P1 — growth & retention, 1–2 quarters)
4. **Real-time translation** — in-match text translation + live subtitles (Azar/LivU/OmeTV parity). Biggest single unlock for a global user base; do text first, subtitles via speech-to-text later.
5. **Gifts in-call UI** (backend already exists) — animated gifts over video; gift→XP economy (Paltalk's loop) with monthly XP decay to drive daily habit.
6. **Trust-score → matchmaking** (Emerald karma): surface karma, weight queue priority, decay on reports/skips-abuse. `trustScore` already exists but is unused.
7. **Re-match flow done right** (backend exists): refund if declined/timeout; "find them again" button post-call.
8. **Voice-only & text-roulette modes** — dramatically cheaper bandwidth (capacity headroom while video infra scales) and a softer on-ramp for shy users (HOLLA/Emerald parity).
9. **Interest matching for free users** (premium keeps gender/region/travel filters) — improves first-match quality, the #1 churn moment.

### Later (P2 — post-SFU differentiation)
10. **Group video ("Squad")** and couple mode (Monkey/OmeTV parity) — requires SFU, so gated on Phase 4.
11. **Face filters / AR effects** (Chatrandom/Azar parity).
12. **Profiles as social pages** — mood/song (Monkey), photo posts, follows/Lounge (Azar) — only after safety stack is strong enough to carry UGC.
13. **Rewarded ads for coins/extra time** (Monkey pattern) as a zero-conversion monetization layer.
14. **Battle pass / seasonal events** layered on coins+XP.
15. **Native mobile apps** — with the strategic caveat below.

### Strategic risk to plan around now
- **Apple (Feb 2026): random/anonymous chat apps are explicitly not allowed on the App Store and may be removed without notice.** A pure Omegle-style client will not survive iOS review. Mitigations to design in from the start: lead with **accountable identity** (phone/Google sign-in only — no anonymous guests in production), verified profiles, friend/community-first product surface with random video as *one* mode among many, published moderation team + reporting SLAs, and 18+ age assurance. Prioritize **Android + responsive web/PWA** as the launch platforms; treat iOS as a later, product-shaped-for-review target.
- Google Play is attainable for random chat but requires Child Safety Standards compliance, in-app reporting/blocking, a designated safety contact, and real moderation — all P0 items above.

### Sources
[Apple guideline clarification (Feb 2026)](https://developer.apple.com/news/?id=d75yllv4) · [App Review Guidelines §1.2](https://developer.apple.com/app-store/review/guidelines/) · [Google Play Child Safety Standards](https://support.google.com/googleplay/android-developer/answer/14747720) · [Google Play UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937) · [UK OSA explainer](https://www.gov.uk/government/publications/online-safety-act-explainer/online-safety-act-explainer) · [EU DSA minors' guidelines](https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-protection-minors) · [BBC: Omegle shutdown](https://www.bbc.com/news/business-67364634) · competitor listings: [Azar](https://play.google.com/store/apps/details?id=com.azarlive.android), [HOLLA](https://www.holla.world/), [OmeTV](https://ome.tv/), [Emerald](https://emeraldchat.com/), [Chatroulette](https://chatroulette.com/), [Monkey](https://www.monkey.app/), [LivU](https://livuapp.com/faq.html), [Paltalk](https://www.paltalk.com/) · infra: [LiveKit](https://docs.livekit.io/reference/internals/livekit-sfu/), [mediasoup](https://mediasoup.org/documentation/v3/scalability/), [Socket.IO](https://socket.io/docs/v4/redis-adapter/), [Cloudflare Realtime](https://developers.cloudflare.com/realtime/sfu/platform/pricing/), [coturn](https://github.com/coturn/coturn/wiki/turnserver), [Redis matchmaking](https://redis.io/tutorials/matchmaking-and-game-session-state-with-redis/), [Hive](https://thehive.ai/pricing), [Sightengine](https://sightengine.com/pricing), [AWS Rekognition](https://aws.amazon.com/rekognition/pricing/)

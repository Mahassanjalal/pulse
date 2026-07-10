# PLAN — Pulse Gap, Duplication & Incomplete-Work Audit

> **Goal:** Explore the whole project; catalogue gaps in backend, frontend, and their integration; find duplications / duplicated work; find incomplete or mock/stub work and pending roadmap items; and lay out a plan to fix them all.
>
> **Method:** Three parallel explore agents (backend, frontend, integration) + direct verification of every high-impact claim against source. All findings below carry `file:line` evidence.
>
> **Status of codebase (verified):** Functional MVP. Backend is real (Fastify + Prisma + Socket.IO). Frontend is Angular 16 SPA; most core services (Auth, Socket, Matching, Chat, Notification, WebRTC) are now wired to the real API. Remaining work is (a) dead/duplicate code, (b) inconsistent error contracts, (c) missing real-time pushes, (d) schema-only stubs with no logic, (e) orphaned admin API + unused shared components, (f) missing auth/leaderboard/report-consumer flows.

---

## 1. Backend Gaps & Incomplete Work

### 1.1 Validation returns HTTP 500 instead of 400 (BUG)
Every `.parse()` throws `ZodError`, which has no `statusCode`, so the global handler (`server.ts`) returns **500** for all malformed input.
- `auth.ts:157,196` · `user.ts:115,133,145` · `chat.ts:32,208` · `report.ts:15`
- Fix: add a `ZodError` branch in `server.ts` error handler returning **400 + `issues`**, or switch routes to `safeParse` + `reply.status(400)`. Reuse the currently-dead `lib/errors.ts` (`ApiError`/`sendError`).

### 1.2 Error bodies returned with HTTP 200 (BUG)
These return `{ error }` but never set `reply.status(4xx)`:
- `match.ts:44` (`/matches/:id/end`) → 200
- `chat.ts:156,171,220,236,240` (`/chat/messages*`) → 200
- `premium.ts:175` (`/premium/subscribe` "Invalid plan") → 200 (while `create-checkout` correctly uses `reply.status(400)` — inconsistent)
- Fix: standardize every `{ error }` return with `reply.status(4xx).send(...)`. Add a tiny `fail(reply, code, msg)` wrapper.

### 1.3 Achievements — schema-only stub (no logic)
`UserAchievement` model exists (`schema.prisma`) and is `select`ed in `auth.ts:318`, `user.ts:217`, but **nothing ever creates/updates a row** and seed creates none. Frontend always gets `[]`.
- Fix: either implement unlock logic (events: first conversation, 10/100 convos, first friend, daily streak, etc.) + a `GET /users/me/achievements` consumer, or remove the `UserAchievement` model + selects + the `achievements` field from `DashboardStats`/`UserProfile` to stop implying functionality.

### 1.4 Reputation/leaderboards — not implemented
- `trustScore`, `communityRating`, `verificationLevel` columns are returned but **never recomputed** (only random seed values in `seed.ts`).
- **No `/leaderboard` endpoint exists**; `discover`/`dashboard` only `orderBy trustScore desc`. Frontend `LeaderboardEntry` type (`user.model.ts:136`) is unused.
- Fix: either build a reputation engine (compute on conversations/reports) + a leaderboard endpoint, or remove the misleading columns/types.

### 1.5 Coins — earn-only
- `+10` coins only in `/users/me/daily-reward` (`user.ts:253-277`). No spend path, no gifts/boosts/super-likes (all in spec). `RegisterData.phone` sent by frontend is silently ignored (no `phone` column).
- Fix (roadmap): add spend endpoints or document coins as earn-only for now.

### 1.6 Admin API is orphaned (7 endpoints, no frontend)
`admin.ts:17,45,65,85,104,122,140` — no admin module exists. Latent privileged surface with no consumer.
- Fix: scaffold `features/admin/` module consuming these (roadmap), or gate behind a flag.

### 1.7 Dead backend code
- `lib/errors.ts` — never imported.
- `NotificationService.matchEnded()` (`notifications.ts:42`) — never called.
- Fix: wire `matchEnded` into the `end_match`/`skip_match` socket handlers, or delete it; wire/delete `errors.ts`.

---

## 2. Frontend Gaps & Incomplete Work

### 2.1 Auth stubs that throw (6) — backend-missing
`auth.service.ts:106-126` throw "not yet implemented on backend":
- `loginWithApple`, `loginWithPhone`, `sendOtp`, `verifyOtp`, `resetPassword`, `recoverAccount`
- Backend has no Apple/phone/OTP/reset/recovery routes (only google/email/guest/change-password).
- Fix: implement backend routes + schema (`phone` column), then wire the UI; until then, hide/disable these UI affordances instead of throwing.

### 2.2 Frontend integration status (corrected)
- **`NotificationService` is REAL** (REST + socket subscribe to `'notification'`). The root `AGENTS.md` note "still stub/mock" is **stale** — the real gap is that the backend never emits `'notification'` (see §3).
- **`WebRTCService` is REAL** (`getUserMedia` + `RTCPeerConnection` + socket signaling). Not a stub.
- **`ChatService` is REAL** (REST conversations/messages; in-match chat via socket). Graceful `[]` fallback, not mock.

### 2.3 Duplicate local types / model drift
- `profile.page.ts:10-31` re-declares a local `UserProfile` diverging from `user.model.ts:142-160` (drops `achievements`, `preferences`, count typing; `privacySettings?: any`).
- `discover.page.ts:8-19` (`TaggedUser`) overlaps `DiscoverUser` (`user.model.ts:166`).
- Fix: delete local interfaces; import from `@models/user.model`.

### 2.4 Unused service methods (dead code)
- `MatchingService.getMatchHistory()` (`matching.service.ts:167`) — no caller → `GET /matches/history` orphaned.
- `UserService.searchUsers()` (`user.service.ts:82`) — no caller (no search UI) → `GET /users/search` orphaned.
- `PremiumService.getSubscription()` / `subscribe()` — no caller (page uses `createCheckout`).
- Fix: wire a match-history screen, a search UI, and a subscription display, OR remove the methods + endpoints.

### 2.5 Hardcoded/seed-only page content
- `about.page.ts:196-201` — `team` array of 4 fake members (marketing page, acceptable but it's the one pure-seed page).
- `premium.page.ts:194` — `premiumFeatures` static list (UI copy, acceptable).
- These are not "mock user data" — actual user lists are API-driven. Leave but note.

---

## 3. Integration Gaps (Front ↔ Back)

### 3.1 Real-time socket events subscribed but never emitted (backend-missing)
Frontend `SocketService` registers and `NotificationService`/`MatchingService` subscribe to:
- `notification` — backend only persists via `NotificationService.create`, never emits → real-time push absent (`notification.service.ts:16`).
- `friend_request_received`, `friend_request_accepted`, `friend_added` — backend only emits `friend_request_notification` (`handlers.ts:420`). On accept (`friend.ts:120-150`) nothing is pushed to the requester.
- `matching` — registered (`socket.service.ts:53`) but unused; backend emits `matching_queue`/`matching_cancelled`.
- **Fix:** In `NotificationService.create`, `io.to(user_room).emit('notification', payload)`. In `friend.ts` accept handler, emit `friend_request_accepted`/`friend_added` to the requester. This completes the social UX without frontend changes.

### 3.2 Field/shape mismatches (DTO ↔ frontend model)
| Concept | Backend/DB | Frontend (`user.model.ts`) | Action |
|---|---|---|---|
| Presence | `status: 'ONLINE'\|'OFFLINE'\|'MATCHING'` (UPPER) | `onlineStatus: 'online'\|'offline'\|'away'` | Add mapping layer in services |
| `languages`/`interests` | JSON **string** (REST) / array (socket `match_found`) | `string[]` | Parse in service, normalize socket vs REST |
| `createdAt` | `createdAt: string` | `joinedDate: Date` | Map `createdAt → joinedDate` |
| `UserPreferences.ageRange` | `ageRangeMin`/`ageRangeMax` | `ageRange: {min,max}` | Map flat↔nested |
| `Match.status` | `'ACTIVE'\|'ENDED'\|'SKIPPED'\|'PENDING'` | `'active'\|'ended'\|'pending'` | Normalize casing |
| `Notification.data` | `JSON.stringify`'d string | object (frontend `JSON.parse`s) | OK but keep consistent |
- **Fix:** centralize normalization in `UserService`/`AuthService` mappers (or a `dto.ts` in `models`), so components never re-parse.

### 3.3 No phantom endpoints
Every non-dead `http.*` call maps to a real backend route. Good. Only the dead methods in §2.4 have no consumers.

---

## 4. Duplication Inventory

### 4.1 Backend — peer resolution idiom repeated ~12×
`match.user1 === userId ? match.user2 : match.user1` (and friend `senderId === userId ? receiverId : senderId`):
- `chat.ts:50,178,213` · `friend.ts:27` · `user.ts` mutual-friends · `socket/handlers.ts:263,278,289,327,345,372`
- **Fix:** add `getPeerId(match, userId)` / `getPeer(match, userId)` in `lib/relations.ts` and use everywhere.

### 4.2 Backend — "my friend IDs" query repeated 5×
`OR [{senderId:userId},{receiverId:userId}]`:
- `chat.ts:18-24` · `friend.ts:13-17` · `socket/handlers.ts:24-32` · `user.ts` mutual-friends · `lib/user.ts:9-15`
- **Fix:** `getFriendIds(userId)` + `isFriend(userId, peerId)` in `lib/relations.ts`.

### 4.3 Backend — friend-request guards duplicated & weaker in socket
- `friend.ts:60-72` checks existing request **and** existing friend. `socket/handlers.ts:389-401` (`add_friend`) checks **only** existing request and **omits `isBlocked`** (REST does at `friend.ts:52`).
- **Fix:** `findFriendRequest(userId, peerId)` + reuse `isBlocked` in socket path.

### 4.4 Backend — premium plan lookup/guard duplicated
`create-checkout`, `subscribe`, webhook each re-find plan + guard "Invalid plan"; dev-mode branch repeated.
- **Fix:** `resolvePlan(planId)` helper used by all three.

### 4.5 Frontend — premium plan rendering duplicated
`premium-modal.component.ts:91` and `premium.page.ts:144` both call `getPlans()` and render the same cards.
- **Fix:** extract a shared `<pulse-plan-list>` (or reuse modal's renderer) as single source of truth.

### 4.6 Frontend — 9 unused shared components (dead + duplication risk)
Declared/exported in `SharedModule` but **never used** in any `.html` (verified by `<pulse-*>` scan):
- `pulse-user-card`, `pulse-video-player`, `pulse-chat-bubble`, `pulse-interest-tag`, `pulse-badge`, `pulse-glass-card`, `pulse-neon-button`, `pulse-input`, `pulse-trust-score` (only `pulse-premium-modal` and `pulse-status-indicator` appear; the latter only inside the unused `video-player`).
- Meanwhile every feature hand-rolls the same UI inline (raw `<video>` in `video-chat.page.html` instead of `pulse-video-player`; custom user cards instead of `pulse-user-card`).
- **Fix (choose one):** (a) replace inline UI with the shared components, OR (b) remove the unused components. Recommended: adopt `pulse-user-card`, `pulse-chat-bubble`, `pulse-video-player`, `pulse-status-indicator`, `pulse-badge`, `pulse-neon-button`, `pulse-glass-card`, `pulse-input` across pages (DRY + consistency), and delete only those never sensibly reused.

### 4.7 REST vs socket behavior divergence
`POST /matches/:id/end` (REST) increments conversation count for **caller only** and emits nothing; `end_match` socket handler increments **both** and notifies peer. Frontend uses socket path, so REST is a weaker duplicate.
- **Fix:** make REST end-match mirror socket (increment both, emit to peer) or deprecate REST match-end in favor of socket.

---

## 5. Prioritized Fix Plan

**P0 — Correctness / contract (do first; cheap, high impact)**
1. Backend `ZodError` → 400 + issues (`server.ts` handler) — fixes §1.1.
2. Add `reply.status(4xx)` to every error return (§1.2) — script a pass over all route files.
3. Emit `notification` from `NotificationService.create` (§3.1) — completes real-time notifications.
4. Emit `friend_request_accepted`/`friend_added` on accept (§3.1) — completes friend UX.

**P1 — Duplication cleanup (consistency, maintainability)**
5. New `lib/relations.ts`: `getPeerId`, `getPeer`, `getFriendIds`, `isFriend`, `findFriendRequest` (§4.1–4.3); apply across routes + socket.
6. `resolvePlan()` helper in `premium.ts` (§4.4).
7. Shared `<pulse-plan-list>` to kill dual premium rendering (§4.5).
8. Adopt/remove unused shared components (§4.6); remove local `UserProfile`/`TaggedUser` (§2.3).

**P2 — Field-shape normalization (integration robustness)**
9. Central DTO mappers in frontend services for `status→onlineStatus`, JSON-string→array, `createdAt→joinedDate`, `ageRange` flat↔nested, status casing (§3.2).
10. Make REST match-end mirror socket behavior (§4.7).

**P3 — Stubs / roadmap (bigger scope, decide build-or-remove)**
11. Achievements: implement unlock logic + consumer, or remove model/selects (§1.3).
12. Reputation/leaderboards: implement engine + endpoint, or remove misleading columns/type (§1.4).
13. Admin module: scaffold `features/admin` consuming `/admin/*` (§1.6), or gate routes.
14. Auth flows: implement phone/OTP/Apple/reset/recovery on backend + schema, wire UI (§2.1).
15. Wire or remove dead methods/endpoints: `getMatchHistory`+`/matches/history`, `searchUsers`+`/users/search`, `getSubscription`/`subscribe` (§2.4, §1).
16. Coins spend / gifts / boosts (§1.5) — roadmap.

---

## 6. Verification (after fixes)
- Backend: `npm test` (Vitest) green; add a test asserting malformed `POST /auth/register` returns **400** (not 500); add a test that accepting a friend request emits `friend_request_accepted` to requester's socket; add a test that creating a notification emits `notification`.
- Frontend: `npx ng build --configuration production` succeeds; `npx ng test` (Karma) green; grep confirms every `<pulse-*>` component is either used or deleted; grep confirms no `throw new Error('... not yet implemented')` remains unless UI is hidden.
- Manual: start both (`npm run dev` + `ng serve`), log in two browsers, confirm real-time friend-request + notification toasts fire without refresh.

---

## 7. Source-of-truth corrections to maintain
- Root `AGENTS.md` §6 & §9 say `NotificationService` is "stub/mock" — **now false**; it is real. Update that note to: "NotificationService is real (REST + socket), but backend must emit `notification` for live push." (deferred to a follow-up edit; tracked here).

# Frontend AGENTS.md — Pulse SPA

Scope: `/frontend`. For product context see root `AGENTS.md`. This file is authoritative when working in this folder.

## Stack
**Angular 16** (NgModule-based), TypeScript 5.1, **Tailwind CSS 3** + custom SCSS, **RxJS** (`BehaviorSubject` state, no NgRx), template-driven `FormsModule`, **socket.io-client**, custom **WebGL/Canvas** directives (no graphics lib), Karma+Jasmine tests.

## Scripts
- `npx ng serve --port 4200` — dev (expects backend on :3000)
- `npx ng build --configuration production`
- `npx ng test` — karma/jasmine
- `npx ng generate component ...` (always attach to a feature `module.ts`)

## Layout
```
src/
  main.ts, index.html, styles.scss, favicon.ico
  assets/
  environments/        # environment.ts (dev) / environment.prod.ts (prod placeholders)
  app/
    app.component.ts              # layout switcher: public | authenticated | video-chat
    app.module.ts                 # bootstrap; registers AuthInterceptor
    app-routing.module.ts         # lazy feature routes + layout data tags
    models/user.model.ts          # User interface + sub-types
    core/
      services/  # AuthService, ChatService, MatchingService, NotificationService, SocketService, WebRTCService
      guards/    # auth.guard.ts (AuthGuard, GuestGuard, PremiumGuard)
      interceptors/ # auth.interceptor.ts (Bearer + 401 auto-refresh)
    shell/
      shell.module.ts
      components/  # header, sidebar, bottom-nav, sidebar-toggle, video-chat-shell
    shared/
      shared.module.ts
      components/  # neon-button, glass-card, user-card, interest-tag, status-indicator,
                   # badge, video-player, trust-score, input, chat-bubble, premium-modal
      directives/  # shader-bg.directive.ts (WebGL plasma), particles-bg.directive.ts (canvas)
    features/       # 13 lazy modules, each module.ts + page.ts + page.html
      landing/ auth/ dashboard/ discover/ messages/ friends/ profile/
      notifications/ settings/ premium/ about/ video-chat/
```

## Routing (layout-driven)
- `public`: `/`, `/login`, `/register`, `/about`
- `authenticated` (data.layout): `/dashboard`, `/messages`, `/friends`, `/profile`, `/profile/:id`, `/video`, `/discover`, `/settings`, `/notifications`
- `/premium` — **not** guarded (intentional upsell page)
- `**` → redirect `/dashboard`
- Guards: `AuthGuard` (redirect → /login), `GuestGuard` (block /login if authed), `PremiumGuard` (check `isPremium` → /premium).

## Services — integration status (IMPORTANT)
- ✅ **AuthService** — real: login/register/guest/Google/Apple/phone+OTP, token storage, `fetchCurrentUser`, `refreshToken`, logout, password reset (resetPassword + resetPasswordConfirm). All flows wired to the backend.
- ✅ **SocketService** — real: wraps socket.io-client, registers all events, heartbeat (30s), presence sync, WebRTC emit helpers, matching/chat/friend helpers.
- ✅ **MatchingService** — real: subscribes to socket match events, exposes `status$`, `matchFoundObs$`, `timer$`, controls (start/skip/end/reconnect).
- ✅ **ChatService** — real: REST conversations/messages + socket in-match chat.
- ✅ **NotificationService** — real: REST `/notifications` + subscribes to the real-time `notification` socket event.
- ✅ **WebRTCService** — real: `getUserMedia` + `RTCPeerConnection` + socket signaling for offer/answer/candidate.
- ✅ **AdminService** — real: consumes `/admin/*` from the new `features/admin` module (AdminGuard-protected).

## Environments
- `environment.ts`: `apiUrl: 'http://localhost:3000/api/v1'`, `wsUrl: 'http://localhost:3000'`, `googleClientId: 'YOUR_GOOGLE_CLIENT_ID'`.
- `environment.prod.ts`: `apiUrl: '/api/v1'`, `wsUrl: ''` (placeholder), Google ID placeholder. Update before deploy.

## Design system
- Dark obsidian `#131314`; brand magenta `#f7acff`/`#e14aff`; neon cyan `#00eefc`; online green `#2ae500`; error `#ffb4ab`.
- Glassmorphism utilities in `styles.scss`: `.glass-panel`, `.glass-card`, `.neon-glow-primary/cyan/purple`.
- Fonts: Montserrat (headlines), Inter (body) via Google Fonts. Icons: Material Symbols Outlined.
- CSS custom properties mirror Tailwind tokens.

## Conventions
- Feature work → new/extend a lazy module under `features/` with `module.ts` + `page.ts` + `page.html` (external template, no inline).
- Reusable UI → `shared/components` + export from `SharedModule`; feature modules import `SharedModule`.
- Global chrome → `shell/`; singleton logic → `core/services`; state via RxJS subjects.
- **No `border-radius` on sidebar nav items** (matches prototype).
- Use `environment.apiUrl` for HTTP; never hardcode localhost.

## What to wire next (priority)
1. `NotificationService` → `/notifications` (list, unread count, mark read).
2. `WebRTCService` → real peer connection in `/video` (use SocketService signaling + `getUserMedia`).
3. Friend & REST messaging flows → `/friends`, `/chat` endpoints (accept/reject, conversations, messages).
4. Dashboard/discover/friends/profile/settings → replace mock data with API; add loading/error states.
5. Premium → `/premium/create-checkout` + Stripe redirect + `/premium/checkout-status`.
6. Settings persistence → `/users/me/settings`, `/users/me/preferences`, account deletion, block-list UI.
7. Search/discover filters → pass premium `filters` through `MatchingService.startMatching`.

## Gotchas
- `AuthService` defers `loadUser()` via `queueMicrotask` to avoid DI cycle with `AuthInterceptor`.
- Frontend `premium` route is intentionally unguarded; `profile/:id` lacks `AuthGuard` (verify intent before adding).
- `interests`/`languages` are JSON strings from API — parse where needed.
- Build outputs to `dist/`; shared module is eagerly pre-loaded (~350KB), features lazy.

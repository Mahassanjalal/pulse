# Pulse — Frontend

> **Angular 16** single-page application for the Pulse global video-chat and social-discovery platform. Built to pixel-match a complete set of HTML/CSS prototypes with a dark glassmorphism design system, WebGL shader backgrounds, and rich micro-interactions.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Tech Stack](#tech-stack)
- [Design System](#design-system)
- [Architecture](#architecture)
- [Feature Pages](#feature-pages)
- [Shell Components](#shell-components)
- [Shared Components](#shared-components)
- [Shared Directives](#shared-directives)
- [Core Services](#core-services)
- [Routing](#routing)
- [Animations & Interactions](#animations--interactions)
- [Build & Scripts](#build--scripts)

---

## Quick Start

```bash
# install dependencies
npm install

# start dev server (http://localhost:4200)
npx ng serve --port 4200

# production build
npx ng build --configuration production
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Angular 16 (NgModule architecture) |
| Styling | Tailwind CSS 3 + custom SCSS (`styles.scss`) |
| Fonts | Montserrat (headlines 700–900) + Inter (body 400–600) via Google Fonts |
| Icons | Material Symbols Outlined (variable font) |
| WebGL | Custom GLSL fragment shader (no external lib) |
| Animations | CSS `@keyframes` + Angular `HostListener` micro-interactions |
| State | RxJS `BehaviorSubject` in services (no NgRx) |
| Forms | Angular `FormsModule` (template-driven) |

---

## Design System

### Color Palette

All colors are defined as Tailwind config extensions **and** CSS custom properties in `styles.scss`:

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#f7acff` | Brand, CTAs, active states |
| `primary-container` | `#e14aff` | Button backgrounds, highlights |
| `secondary` | `#d3fbff` | Technical features, borders |
| `secondary-container` | `#00eefc` | Neon cyan glow, active indicators |
| `secondary-fixed` | `#7df4ff` | Sidebar active state, verified badges |
| `tertiary` | `#2ae500` | Online status, success states |
| `background` / `surface` | `#131314` | Deep obsidian base |
| `surface-container` | `#201f20` | Floating panels, cards |
| `on-surface` | `#e5e2e3` | Primary text |
| `error` | `#ffb4ab` | Warnings, destructive actions |

### Glassmorphism Utilities (`styles.scss`)

```scss
.glass-panel   // rgba(26,26,30,0.6) + blur(20px) + 1px rgba white border
.glass-card    // same + linear-gradient edge shimmer via ::before
.neon-glow-primary    // box-shadow: 0px 0px 20px rgba(216,0,255,0.4)
.neon-glow-purple     // hover: box-shadow: 0px 0px 20px #D800FF
.neon-glow-cyan       // box-shadow: 0px 0px 12px rgba(0,238,252,0.4)
.neon-glow-secondary  // alias for neon-glow-cyan
```

### Keyframe Animations

| Class | Effect |
|---|---|
| `.animate-floating` / `.mockup-float` | `translateY(0 ↔ -20px)` loop, 6s |
| `.pulse-animation` | Opacity 1 ↔ 0.5 loop, 2s (status dots) |
| `.animate-pulse-ring` | Scale 1 → 2.5 + fade, 2s |
| `.animate-pulse-ring-sm` | Box-shadow ring expand, 1.5s |
| `.kinetic-text` | Letter-spacing −0.05em ↔ 0.05em, 3s |
| `.animate-gradient` | Background-position shift, 8s |

---

## Architecture

```
src/app/
├── app.component.ts          # Root — layout switcher (public / authenticated / video-chat)
├── app-routing.module.ts     # Lazy-loaded feature routes with layout data tags
├── app.module.ts             # Bootstrap module
│
├── core/                     # Singleton services + guards
│   ├── guards/
│   │   └── auth.guard.ts     # AuthGuard, GuestGuard, PremiumGuard
│   └── services/
│       ├── auth.service.ts
│       ├── chat.service.ts
│       ├── matching.service.ts
│       ├── notification.service.ts
│       ├── socket.service.ts
│       └── webRTC.service.ts
│
├── models/
│   └── user.model.ts         # Full User interface + sub-types
│
├── shell/                    # Global layout chrome
│   ├── shell.module.ts
│   └── components/
│       ├── header/           # Fixed top bar, scroll-shrink effect
│       ├── sidebar/          # Desktop nav, active-state routing
│       ├── bottom-nav/       # Mobile 5-item nav
│       ├── sidebar-toggle/   # Mobile hamburger
│       └── video-chat-shell/ # Minimal header for video layout
│
├── shared/                   # Reusable UI components + directives
│   ├── shared.module.ts
│   ├── components/           # 10 shared components (see below)
│   └── directives/
│       ├── shader-bg.directive.ts    # WebGL plasma shader
│       └── particles-bg.directive.ts # Canvas particle system
│
└── features/                 # 13 lazy-loaded feature modules
    ├── landing/
    ├── auth/
    ├── dashboard/
    ├── discover/
    ├── messages/
    ├── friends/
    ├── profile/
    ├── notifications/
    ├── settings/
    ├── premium/
    ├── about/
    ├── video-chat/
    └── (implicit wildcard → dashboard)
```

### Layout Switching (`app.component.ts`)

The root component detects the current route and renders one of three layouts:

| Layout | Condition | Shell |
|---|---|---|
| `authenticated` | Routes: `/dashboard`, `/messages`, `/friends`, `/profile`, `/settings`, `/discover`, `/premium`, `/notifications` | Header + Sidebar + BottomNav |
| `video-chat` | Route: `/video` | Fullscreen (no shell) |
| `public` | Everything else: `/`, `/login`, `/register`, `/about` | Router outlet only |

---

## Feature Pages

Every feature module follows the same pattern:
- `feature.module.ts` — lean NgModule with `RouterModule.forChild`
- `feature.page.ts` — component class with logic
- `feature.page.html` — external template

### `/` — Landing Page

**File:** `features/landing/landing.page.ts`

- Full-height hero (`h-[921px]`) with **WebGL shader background** (`pulseShaderBg`)
- Gradient-to-background overlay for text legibility
- **Parallax mousemove** — all `.parallax-card` elements shift `translate3d(x*10, y*10, 0)` on `document:mousemove`
- **Scroll-shrink header** — transitions from `h-20` to `h-16` after 50px scroll
- Floating 3D phone mockups with `mockup-float` CSS animation (staggered delay)
- Stats grid (50M+ users, 190+ countries, 1B+ matches, 4.9/5 rating)
- Bento feature grid (12-col): Translation (col-8), Safety (col-4), Video (col-4), Discovery (col-8)
- CTA section with App Store / Play Store buttons
- Footer with Company / Legal / Social columns
- Mobile bottom navigation (standalone, no shell)

### `/login` `/register` — Auth Page

**File:** `features/auth/auth.page.ts`

- 50/50 split layout (hidden on mobile)
- **Left panel** — WebGL shader background (`pulseShaderBg`) + dark overlay + `kinetic-text` animation on "Pulse" logo
- **Right panel** — Tab toggle (Login ↔ Sign Up) with `mode` state
- Glass-panel input fields with cyan focus border + glow (`focus:border-secondary`)
- Social auth buttons (Google / Apple)
- Online user count badge with green pulsing dot

### `/dashboard` — Home Dashboard

**File:** `features/dashboard/dashboard.page.ts`

- Hero matching section with **LIVE user count** badge (`pulse-animation` dot)
- "Start Random Video Chat" + "Surprise Me" CTA buttons
- **Trending Now** grid — 3 user cards (aspect 3:4) with:
  - `group-hover:scale-110` image zoom (700ms)
  - `mouseenter` → `borderColor: rgba(247,172,255,0.4)` + `translateY(-2px)` (matches prototype JS)
  - `mouseleave` → reset styles
- Daily Rewards sidebar — 5-day streak tracker + Claim Gems button with `neon-glow-cyan`
- Quick Friends list — 3 online friends with pulsing status dots and chat icon reveal

### `/discover` — Discovery

**File:** `features/discover/discover.page.ts`

- Floating ambient gradient orbs (`bg-primary/5`, `bg-secondary-fixed/5`) with `blur-[120px]`
- Filter sidebar (w-72 on desktop) with gender, country, language, interest filters
- Responsive user cards grid: 1 col → 2 → 3 → 4 columns (xl)
- Cards feature: hover tag fade-in, online/trending badges, verified/premium icons, language tags
- Premium locked card with dashed border + lock icon
- Premium upsell banner at bottom with feature grid + pricing card
- **Click ripple effect** — `document:click` spawns `animate-ping` div at cursor position (600ms lifetime)

### `/messages` — Messaging

**File:** `features/messages/messages.page.ts`

- Split layout: conversation list (w-80) + active chat area
- Conversation list — active chat highlighted with `border-l-2 border-primary` + `bg-primary/10`
- Online status dots with `pulse-animation` on avatars
- Unread count badges (purple pill)
- Chat area — message bubbles (self: purple right-aligned, other: surface-container left-aligned)
- Typing indicator — 3 animated dots with staggered `pulse-animation`
- Message input — rounded-full with send button (`neon-glow-primary`)
- `ngModel` two-way binding on input

### `/friends` — Friends

**File:** `features/friends/friends.page.ts`

- Search input with focus transition
- **Online Now** section — 3 friends with green pulse dots, chat + video action buttons
- **All Friends** list with favorite/remove actions
- Friend Requests sidebar — accept (green check) / decline (×) buttons
- Invite Friends panel — copy link + share button with `neon-glow-primary`

### `/profile` — User Profile

**File:** `features/profile/profile.page.ts`

- Hero section with **floating particle canvas** (`pulseParticlesBg`) — 50 purple particles animating over the cover image
- Full-width cover image with `bg-gradient-to-t from-surface` overlay
- Circular avatar with verified badge + Verified / Premium pills
- Favorite + Message action buttons
- **12-column bento grid**:
  - Left (8 cols): Bio + interest tags, Social stats (3 cards), Activity timeline with vertical line
  - Right (4 cols): SVG trust score gauge (conic-gradient circle), Privacy toggle switches, Mutual friends stack
- Trust gauge uses `<circle>` SVG with `stroke-dasharray/offset` for animated progress

### `/notifications` — Notifications

**File:** `features/notifications/notifications.page.ts`

- Icon-color-coded notification types (friend_request, message, like, stars, etc.)
- Unread items highlighted with `border-l-2 border-primary` left accent
- Mark All as Read button
- Type-specific icon colors (primary for friend, secondary for chat, tertiary for stars)

### `/settings` — Settings & Preferences

**File:** `features/settings/settings.page.ts`

- Account section — profile avatar with edit overlay, display name + email inputs, password change
- Video & Audio — camera select, background blur toggle, low-light mode, live preview (aspect-video)
- **Toggle switches** — `settings` Record with default values, `toggleSetting(key)` method, visual on/off states
- Appearance — Dark Glow theme selected (with ring highlight), language dropdown
- Privacy & Trust — trust score display, visibility toggles, blocked users count
- Defaults: `showOnlineStatus: true`, `backgroundBlur: true`, `darkTheme: true`, `profileDiscovery: true`

### `/premium` — Premium Plans

**File:** `features/premium/premium.page.ts`

- 3 pricing tiers: Basic ($4.99), Premium ($9.99 — "Most Popular"), Ultimate ($19.99)
- Feature comparison table with check/cross icons per tier
- Premium perks highlight grid
- Feature cards: Gender filter, HD Video, Global Travel, Ad-free, Premium badge, Priority support

### `/about` — About Us

**File:** `features/about/about.page.ts`

- "Born from Isolation" origin story section
- Safety by Design bento: AI Moderation, Trust Score, Zero Tolerance, P2P Encryption
- Team member cards with hover gradient overlay
- "The Global Bridge" stats section
- CTA section

### `/video` — Live Video Chat

**File:** `features/video-chat/video-chat.page.ts`

- Fullscreen peer video (no shell header — standalone layout)
- Fixed 16px top bar with Pulse logo + LIVE timer + close button
- **Neon glow mousemove** — `document:mousemove` tracks cursor → `translate(glowX, glowY)` on peer video border element, formula: `(clientX/innerWidth - 0.5) * 20`
- Self PiP video (bottom-left, `w-32 md:w-44` aspect-video) with muted/camera-off states
- Floating glassmorphic control bar:
  - Mic toggle (error glow when muted)
  - Camera toggle (error glow when off)
  - Effects button
  - **Next Match** CTA button (`neon-glow-primary`)
  - Add Friend + Report + Chat toggle buttons
- Collapsible chat panel (right, `w-80`) with message bubbles and input
- `chatOpen`, `isMuted`, `isCameraOff`, `glowX`, `glowY` component state

---

## Shell Components

### Header (`pulse-header`)

- Fixed top bar, `z-50`
- **Scroll-shrink**: `window:scroll` listener — `h-20 bg-surface/60` → `h-14 bg-surface/95` after 50px
- Left: Sidebar toggle (mobile) + Pulse logo
- Center: Search input (hidden below md) — glass bg, rounded-full, cyan focus border
- Right: Discover + Premium links (`hidden lg:flex`) → Go Live button → Settings icon → Avatar with `border-2 border-primary`

### Sidebar (`pulse-sidebar`)

- Fixed left, `w-72`, `z-50`, visible on md+
- Purple neon shadow: `shadow-[0_0_12px_rgba(247,172,255,0.4)]`
- Logo + "Global Discovery" tagline
- Nav items styled via `.sidebar-item` component CSS:
  - **Inactive**: `color: on-surface-variant`, hover `bg-white/5 + color: primary`, `active:scale-95`
  - **Active** (`routerLinkActive="active"`): `color: secondary-fixed`, `font-weight: 700`, `bg-secondary-fixed/10`, `border-left: 4px solid secondary-fixed` — **no border-radius** (matches prototype exactly)
- Notification badge: `bg-primary` pill with count `3`
- **Start Matching** button: `neon-glow-purple` hover, `bg-primary-container`

### Bottom Nav (`pulse-bottom-nav`)

- Mobile-only (`md:hidden`), fixed bottom, `h-16`
- 5 items: Home / Explore / **Add** (centered, `-translate-y-6`, purple neon glow) / Messages / Profile
- `routerLinkActive` highlights active route

---

## Shared Components

| Selector | File | Purpose |
|---|---|---|
| `pulse-neon-button` | `neon-button.component.ts` | Pill button, variants: primary/secondary/outline/ghost, sizes sm/md/lg |
| `pulse-glass-card` | `glass-card.component.ts` | Glassmorphism wrapper, custom padding + minHeight |
| `pulse-user-card` | `user-card.component.ts` | 3:4 aspect profile card, bg-image, hover scale, LIVE/verified badges, interest tags |
| `pulse-interest-tag` | `interest-tag.component.ts` | Toggleable pill tag, selected → cyan border |
| `pulse-status-indicator` | `status-indicator.component.ts` | 8px colored dot + pulse-ring animation |
| `pulse-badge` | `badge.component.ts` | Type badges: verified (cyan), premium (gold), online (green), live (red) |
| `pulse-video-player` | `video-player.component.ts` | `<video>` wrapper with status overlay |
| `pulse-trust-score` | `trust-score.component.ts` | Circular conic-gradient gauge |
| `pulse-input` | `input.component.ts` | Glass input, label, icon, hint, cyan focus glow |
| `pulse-chat-bubble` | `chat-bubble.component.ts` | Message bubble — self (primary, right) / other (surface-container, left) |

All components are declared and exported from `SharedModule`. Feature modules import `SharedModule` to access all of these.

---

## Shared Directives

### `pulseShaderBg` — WebGL Plasma Shader

**File:** `shared/directives/shader-bg.directive.ts`

Appends a `<canvas>` as the first child of the host element and runs a GLSL fragment shader using WebGL. The shader produces an animated neon plasma pattern in the Pulse brand colors (deep purple → cyan cycle).

- GLSL palette function uses cosine-based color cycling
- 4 fractal iteration loops for complexity
- `ResizeObserver` keeps canvas in sync with element size
- `cancelAnimationFrame` + canvas removal on `ngOnDestroy`
- `pointer-events: none` — never blocks user interactions

**Usage:**
```html
<section class="relative h-[921px]" pulseShaderBg>
  <div class="relative z-10">Content above shader</div>
</section>
```

**Applied to:** Landing page hero, Auth page left panel

### `pulseParticlesBg` — Canvas Particle System

**File:** `shared/directives/particles-bg.directive.ts`

Appends a `<canvas>` at `z-index: 1` and renders 50 floating particles in `rgba(247, 172, 255, alpha)` (electric purple). Particles wrap around edges and animate continuously.

- Particle properties: `x, y, vx, vy, size (0.5–2.5px), alpha (0.05–0.45)`
- `ResizeObserver` re-spawns particles on resize
- `cancelAnimationFrame` on `ngOnDestroy`

**Applied to:** Profile page hero section

---

## Core Services

| Service | Key Behavior |
|---|---|
| `AuthService` | Mock auth with `BehaviorSubject<User>`. Methods: `login`, `register`, `loginWithGoogle`, `loginWithApple`, `loginWithPhone`, `verifyOtp`, `logout` |
| `ChatService` | In-memory chat store by `chatId`. Real-time via RxJS Subjects: `sendMessage`, `getMessages`, `markAsRead`, `getUnreadCount` |
| `MatchingService` | Simulates 2–5s matching delay. States: `idle → matching → matched → ended`. Generates random match profiles |
| `NotificationService` | Notification store with `BehaviorSubject` unread count. Types: friend_request, message, like, stars, group, premium |
| `SocketService` | Stub for WebSocket integration: `connect`, `on`, `emit`, `joinRoom`, `leaveRoom` |
| `WebRTCService` | Stub for peer connections: `startCamera`, `stopCamera`, `toggleMicrophone`, `createOffer`, `setAnswer` |

**Guards:**
- `AuthGuard` — redirects unauthenticated users to `/login`
- `GuestGuard` — prevents authenticated users from accessing `/login`
- `PremiumGuard` — checks `user.isPremium`, redirects to `/premium`

---

## Routing

```typescript
// app-routing.module.ts (lazy-loaded)
/                → LandingModule
/login           → AuthModule
/register        → AuthModule
/dashboard       → DashboardModule    { layout: 'authenticated' }
/messages        → MessagesModule     { layout: 'authenticated' }
/friends         → FriendsModule      { layout: 'authenticated' }
/profile         → ProfileModule      { layout: 'authenticated' }
/profile/:id     → ProfileModule      { layout: 'authenticated' }
/video           → VideoChatModule    { layout: 'authenticated' }
/discover        → DiscoverModule     { layout: 'authenticated' }
/settings        → SettingsModule     { layout: 'authenticated' }
/premium         → PremiumModule      { layout: 'authenticated' }
/about           → AboutModule
/notifications   → NotificationsModule { layout: 'authenticated' }
/**              → redirect to /dashboard
```

---

## Animations & Interactions

| Feature | Implementation | Page |
|---|---|---|
| Mousemove parallax | `@HostListener document:mousemove` → `.parallax-card` `translate3d(x*10, y*10, 0)` | Landing |
| Scroll navbar shrink | `@HostListener window:scroll` → `h-20 ↔ h-14` | Landing + Header |
| WebGL shader | `ShaderBgDirective` + GLSL fragment shader | Landing hero, Auth left panel |
| Floating particles | `ParticlesBgDirective` + Canvas 2D | Profile hero |
| Click ripple | `@HostListener document:click` → `animate-ping` div at cursor (600ms) | Discover |
| Card hover effects | `mouseenter/mouseleave` → `borderColor + translateY(-2px)` | Dashboard |
| Neon glow mousemove | `@HostListener document:mousemove` → `translate(glowX, glowY)` on video border | Video Chat |
| Floating mockups | CSS `@keyframes floating` + `mockup-float` class | Landing |
| Kinetic text | CSS `@keyframes pulse-tracking` (letter-spacing oscillation) | Auth |
| Status pulse dots | CSS `@keyframes pulse-ring-sm` (box-shadow ring) | All pages |
| Image zoom on hover | Tailwind `group-hover:scale-110 duration-700` | User cards |
| Active scale | Tailwind `active:scale-95` | All buttons |

---

## Build & Scripts

```bash
# Development server
ng serve --port 4200

# Production build (output: dist/)
ng build --configuration production

# Development build
ng build --configuration development

# Unit tests
ng test

# Lint
ng lint

# Generate component (example)
ng generate component features/my-feature/my-feature --module features/my-feature/my-feature.module
```

### Bundle Sizes (Development Build)

| Chunk | Size |
|---|---|
| vendor.js | ~2.50 MB |
| styles.css | ~210 KB |
| main.js | ~49 KB |
| Each feature module | 12–35 KB (lazy-loaded) |
| Shared module (pre-loaded) | ~350 KB |

---

## Project Conventions

- **Feature modules** are lazy-loaded; each has its own `module.ts` + `page.ts` + `page.html`
- **SharedModule** exports all reusable components and directives — feature modules import it
- **ShellModule** is eagerly loaded (part of `AppModule`) — provides global layout chrome
- **CoreModule** is eagerly loaded — provides singleton services and guards
- **No `border-radius` on sidebar nav items** — matches prototype design exactly
- **External HTML templates** for all page components (no inline templates in page files)
- **CSS custom properties** defined in `styles.scss` mirror the Tailwind color tokens
- **Mock data** is used throughout all services — no backend calls wired yet


---
name: Vivid Kinetic
colors:
  surface: '#131314'
  surface-dim: '#131314'
  surface-bright: '#3a393a'
  surface-container-lowest: '#0e0e0f'
  surface-container-low: '#1c1b1c'
  surface-container: '#201f20'
  surface-container-high: '#2a2a2b'
  surface-container-highest: '#353436'
  on-surface: '#e5e2e3'
  on-surface-variant: '#d8bfd6'
  inverse-surface: '#e5e2e3'
  inverse-on-surface: '#313031'
  outline: '#a08a9f'
  outline-variant: '#534153'
  surface-tint: '#f7acff'
  primary: '#f7acff'
  on-primary: '#570067'
  primary-container: '#e14aff'
  on-primary-container: '#4c005b'
  inverse-primary: '#a100be'
  secondary: '#d3fbff'
  on-secondary: '#00363a'
  secondary-container: '#00eefc'
  on-secondary-container: '#00686f'
  tertiary: '#2ae500'
  on-tertiary: '#053900'
  tertiary-container: '#1da800'
  on-tertiary-container: '#043200'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffd6ff'
  primary-fixed-dim: '#f7acff'
  on-primary-fixed: '#350040'
  on-primary-fixed-variant: '#7b0091'
  secondary-fixed: '#7df4ff'
  secondary-fixed-dim: '#00dbe9'
  on-secondary-fixed: '#002022'
  on-secondary-fixed-variant: '#004f54'
  tertiary-fixed: '#79ff5b'
  tertiary-fixed-dim: '#2ae500'
  on-tertiary-fixed: '#022100'
  on-tertiary-fixed-variant: '#095300'
  background: '#131314'
  on-background: '#e5e2e3'
  surface-variant: '#353436'
typography:
  display-lg:
    fontFamily: Montserrat
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.5'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  container-max: 1440px
  gutter: 20px
---

## Brand & Style
The design system is engineered for high-energy social discovery, prioritizing an immersive "always-on" cinematic atmosphere. The brand personality is electric, spontaneous, and safe, designed to reduce friction in digital face-to-face interactions. 

The visual style utilizes **Modern Glassmorphism** layered over a deep obsidian foundation. This creates a sense of infinite depth where video content remains the hero. Design elements feature vibrant neon accents, subtle radial glows to indicate active states, and high-contrast interactive components that feel tactile and responsive. The interface should feel like a premium command center for global connection—fast, addictive, and visually stimulating.

## Colors
This design system operates on a **dark-first** philosophy to maximize the vibrance of video streams and neon accents. 

- **Primary (Electric Purple):** Used for main actions, active navigation states, and brand-heavy moments.
- **Secondary (Neon Cyan):** Used for technical features, verification badges, and secondary "safe" actions.
- **Tertiary (Bright Green):** Specifically reserved for "Online" status indicators and success feedback.
- **Backgrounds:** The "Obsidian" base (#0A0A0B) provides the deepest black for video containers, while "Charcoal" (#1A1A1E) is used for floating panels and glassmorphic backgrounds to create separation.

Apply a 20% opacity tint of the Primary or Secondary color to background blurs to create "aura" effects behind high-priority UI elements.

## Typography
The typography system balances the bold, geometric energy of **Montserrat** for headlines with the technical precision and readability of **Inter** for functional UI and chat elements.

- **Headlines:** Use heavy weights (700+) to create a sense of urgency and excitement. Display sizes should use tighter letter spacing to feel more compact and impactful.
- **Body:** Inter is used for all messaging and profile descriptions to ensure maximum legibility against dark, blurred backgrounds.
- **Labels:** Small labels use increased letter spacing and uppercase styling to denote metadata (e.g., "MATCHING...", "PREMIUM MEMBER") without cluttering the visual field.

## Layout & Spacing
The layout uses a **Fluid Grid** system designed to prioritize the aspect ratio of camera feeds. 

- **Desktop:** 12-column grid with wide 40px margins. Sidebars for chat and friends lists are pinned to the edges, while the primary video feed occupies the central 8-10 columns.
- **Mobile:** Single-column immersive view. Overlays (buttons, info cards) are positioned using a safe-area margin of 20px from the screen edge.
- **Rhythm:** All spacing is based on a 4px baseline. Use 'lg' (24px) for most container padding to ensure the UI feels airy and modern despite the high-intensity color palette.

## Elevation & Depth
Depth is achieved through **Glassmorphism** rather than traditional shadows. Surfaces do not "cast" shadows as much as they "emit" light or block it.

- **Base Layer:** Pure Obsidian (#0A0A0B).
- **Surface Layer:** Charcoal (#1A1A1E) at 60-80% opacity with a 20px Backdrop Blur.
- **Stroke:** Every glass container must have a 1px inner border. Use a linear gradient for the border (Top-Left: White 20% to Bottom-Right: White 5%) to simulate a glass edge.
- **Glows:** High-priority elements like "Online" indicators or "Premium" badges use a soft radial glow (Drop shadow: 0px 0px 12px) using the element's own color at 40% opacity.

## Shapes
The shape language is overtly friendly and modern, utilizing **Large Rounded Corners (2xl)** to contrast with the "tech" feel of the neon colors.

- **Standard Cards/Containers:** 1.5rem (24px) corner radius.
- **Buttons:** Fully pill-shaped (999px) to encourage clicking and provide a soft touchpoint.
- **Inputs:** 1rem (16px) corner radius to maintain a distinct look from buttons.
- **Status Indicators:** Perfect circles with outer "pulse" rings for the active camera state.

## Components
- **Buttons:** Primary buttons use a solid Electric Purple fill. On hover, apply a `box-shadow: 0px 0px 20px #D800FF` to create a neon illumination effect. 
- **Interest Tags/Chips:** Semi-transparent Charcoal background with a 1px border. When selected, the border and text switch to Secondary Cyan.
- **Profile Preview Cards:** Use a vertical gradient overlay (Transparent to 80% Black) at the bottom of the card so name and location typography remain legible over user-generated video/images.
- **Status Indicators:** 
    - *Online:* 8px solid Bright Green circle with a dual-ring pulse animation.
    - *Verified:* Small Cyan shield icon with a white checkmark.
    - *Premium:* Gold text with a subtle metallic linear gradient (135deg).
- **Input Fields:** Dark Charcoal fill, 40% opacity. On focus, the 1px border glows Secondary Cyan.
- **Video Controls:** Floating glassmorphic bar at the bottom of the feed. Icons should be white with a subtle drop shadow for visibility against varying video backgrounds.
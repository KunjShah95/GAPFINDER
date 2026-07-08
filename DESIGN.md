---
name: GapMiner
description: AI-powered research gap discovery tool — scholarly precision meets modern clarity
colors:
  primary: "#1e3a5f"
  primary-light: "#2d5a8e"
  primary-dark: "#0f2744"
  accent: "#b45309"
  accent-light: "#d97706"
  accent-dark: "#92400e"
  neutral-bg: "#f8f9fb"
  neutral-surface: "#ffffff"
  neutral-muted: "#e5e7eb"
  neutral-border: "#d1d5db"
  neutral-ink: "#111827"
  neutral-ink-muted: "#6b7280"
  success: "#166534"
  warning: "#a16207"
  destructive: "#b91c1c"
  info: "#1e40af"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    letterSpacing: "0.01em"
  mono:
    fontFamily: "JetBrains Mono, Fira Code, SF Mono, Monaco, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "20px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
  button-secondary:
    backgroundColor: "{colors.neutral-muted}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  card:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.neutral-ink}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  badge-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  badge-accent:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    padding: "4px 12px"
---

# Design System: GapMiner

## 1. Overview

**Creative North Star: "The Lens"**

GapMiner's design strips away noise to reveal what matters in the research landscape. Like a well-calibrated optical instrument, the interface exists to bring hidden patterns into focus — not to call attention to itself. Every surface, every color, every typographic choice serves comprehension and navigation. The system rejects decoration that doesn't serve understanding.

The aesthetic is scholarly restraint: deep navy carries authority without coldness, warm amber accents signal discovery and warmth like aged paper bindings, and neutral surfaces recede so data stays front-and-center. No glassmorphism, no gradient text, no animated backgrounds. The best design pass removes something, not adds something.

**Key Characteristics:**
- Content-first: every pixel serves comprehension or navigation
- Restrained surfaces: flat or subtly elevated, never decorative
- Deep navy authority: scholarly without being institutional
- Warm accents for discovery: amber signals insight, not decoration
- Precision over polish: every component feels deliberate

## 2. Colors

The palette anchors on deep navy for authority, warm amber for moments of discovery, and cool neutrals that let content breathe.

### Primary
- **Deep Navy** (#1e3a5f): The structural color — navigation, primary buttons, active states, headings. Carries the brand's scholarly weight.
- **Navy Light** (#2d5a8e): Hover states, secondary emphasis within navy contexts, focused inputs.
- **Navy Dark** (#0f2744): Active/pressed states, deep backgrounds for contrast zones.

### Accent
- **Warm Amber** (#b45309): Discovery moments — success indicators, research gap highlights, call-to-action accents. Signals insight without screaming.
- **Amber Light** (#d97706): Hover states on accent elements, secondary accent surfaces.
- **Amber Dark** (#92400e): Active states on accent elements.

### Neutral
- **Cool Paper** (#f8f9fb): Page background — not cream, not white, just slightly cool.
- **Surface** (#ffffff): Cards, modals, elevated content. Clean separation from background.
- **Muted** (#e5e7eb): Subtle fills, disabled states, secondary backgrounds.
- **Border** (#d1d5db): Dividers, input borders, card edges. Visible but not dominant.
- **Ink** (#111827): Primary text — high contrast, never pure black.
- **Ink Muted** (#6b7280): Secondary text, labels, placeholders. Always ≥4.5:1 against its background.

### Named Rules

**The Lens Rule.** Colors exist to organize information, not to decorate. If a color doesn't help the user distinguish, prioritize, or act, remove it. The primary navy appears on ≤15% of any given screen; its restraint is its authority.

**The Warmth Rule.** Warm amber is reserved for moments of discovery and confirmation — a successful analysis, a highlighted gap, a completed action. It never appears as a background or decorative element. Its scarcity makes it meaningful.

## 3. Typography

**Display Font:** Inter (with system fallbacks)
**Body Font:** Inter (with system fallbacks)
**Mono Font:** JetBrains Mono (with Fira Code, SF Mono fallbacks)

**Character:** Inter is a neutral, highly legible sans-serif that disappears into the content. It doesn't carry personality — the research does. Used in multiple weights for hierarchy rather than mixing families.

### Hierarchy
- **Display** (700, clamp(1.875rem, 4vw, 2.25rem), 1.25): Hero section headings. Tight letter-spacing (-0.02em) for presence without shouting.
- **Headline** (600, 1.5rem, 1.375): Section headings, page titles. Clear hierarchy marker.
- **Title** (600, 1.25rem, 1.375): Card titles, subsection headings, list item titles.
- **Body** (400, 1rem, 1.5): Paragraph text, descriptions, content. Max line length 65–75ch for readability.
- **Label** (500, 0.875rem, 0.01em): Button text, input labels, nav items, badges.
- **Mono** (400, 0.8125rem): Code snippets, technical data, API references, metadata.

### Named Rules

**The Disappearing Type Rule.** The reader should notice the content, not the font. If someone comments on the typography, something is wrong. Inter's neutrality is the point — it carries information without calling attention to itself.

**The Line Length Rule.** Body text never exceeds 75ch. Research content is dense; giving it room to breathe is not optional. Short line lengths reduce cognitive load and improve comprehension.

## 4. Elevation

The system uses a restrained shadow vocabulary for structural depth. Surfaces are flat by default; shadows appear on hover, focus, and elevated content (modals, dropdowns, popovers). The shadow scale progresses from subtle ambient presence to clear structural separation.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): Default card state. Barely perceptible, just enough to separate from background.
- **Hover** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): Interactive feedback. Cards lift slightly on hover.
- **Elevated** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): Modals, dropdowns, popovers. Clear separation from page content.
- **Glow** (`box-shadow: 0 0 20px rgb(30 58 95 / 0.3)`): Reserved for focus states on primary actions only. Never decorative.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as response to state (hover, elevation, focus) or structural need (modals, dropdowns). A card sitting idle should feel grounded, not floating.

## 5. Components

### Buttons

- **Shape:** Gently curved edges (8px radius). Not pill-shaped, not sharp.
- **Primary:** Deep navy background, white text. Padding 12px 20px. Subtle shadow at rest, lifted on hover.
- **Hover / Focus:** Background shifts to navy dark, shadow expands. Focus ring uses navy at 25% opacity.
- **Secondary:** Muted gray background, ink text. 1px border for definition.
- **Ghost:** Transparent background, ink text. Appears on hover only.
- **Sizes:** Small (8px 12px, xs text), default (12px 20px, sm text), large (16px 24px, base text).

### Cards

- **Corner Style:** 16px radius — soft but not bubbly.
- **Background:** White (#ffffff) on page background.
- **Shadow Strategy:** Flat at rest, hover shadow for interactive cards. Non-interactive cards stay flat.
- **Border:** 1px solid border (#d1d5db) for definition.
- **Internal Padding:** 24px standard, 16px compact.

### Inputs

- **Style:** 1.5px border, subtle gray background, 12px radius.
- **Focus:** Border shifts to navy, subtle ring appears. No glow, no animation.
- **Error:** Border shifts to destructive red, error message below.
- **Disabled:** Muted background, reduced opacity.

### Navigation (Sidebar)

- **Style:** Deep navy background, white/light text. Fixed width.
- **Active state:** Lighter navy background or left accent bar.
- **Typography:** Label weight, 0.875rem. Active item slightly bolder.
- **Mobile:** Collapses to hamburger, slides in as overlay.

### Badges / Tags

- **Shape:** Full pill radius (9999px).
- **Primary badge:** Navy background, white text.
- **Accent badge:** Amber background, white text.
- **Size:** 4px vertical, 12px horizontal padding. Xs text.

### Data Tables

- **Header:** Muted background, uppercase labels, subtle bottom border.
- **Rows:** White background, hover state highlights row.
- **Border:** Horizontal dividers only, 0.5px muted border.
- **Padding:** 16px cell padding for breathing room.

## 6. Do's and Don'ts

### Do:
- **Do** use deep navy for structural elements (nav, primary buttons, headings) — it carries scholarly authority.
- **Do** use warm amber sparingly for moments of discovery — a successful analysis result, a highlighted research gap, a completed action.
- **Do** keep body text at 4.5:1 contrast minimum against its background. Test every combination.
- **Do** use flat surfaces as the default. Shadows are feedback, not decoration.
- **Do** cap body line length at 65–75ch for readability.
- **Do** use `text-wrap: balance` on headings and `text-wrap: pretty` on long prose.
- **Do** include `@media (prefers-reduced-motion: reduce)` alternatives for all animations.

### Don't:
- **Don't** use gradient text (`background-clip: text`). It's decorative, never meaningful. Use a single solid color.
- **Don't** use glassmorphism (backdrop-filter blur on cards). It's decorative, not functional. Use solid surfaces.
- **Don't** use glowing borders or animated gradients. The current CSS has `.glow-primary`, `.glow-accent` — these are AI slop tells. Remove them.
- **Don't** use cream, sand, or warm-tinted body backgrounds. The current `--background-gradient-end: 238 242 255` (subtle indigo tint) is acceptable; anything warmer is the AI default of 2026.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on cards or list items. Use full borders, background tints, or nothing.
- **Don't** pair similar fonts (two geometric sans-serifs). Inter is the only family; hierarchy comes from weight and size.
- **Don't** animate CSS layout properties unless truly needed.
- **Don't** use bounce or elastic easing. Use ease-out with exponential curves (ease-out-quart, quint, expo).
- **Don't** put `border: 1px solid X` + `box-shadow: 0 Npx Mpx ...` with M ≥ 16px on the same element. Pick one, never both as decoration.
- **Don't** use `border-radius: 24px+` on cards. Cards top out at 16px radius.

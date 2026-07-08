# Orange Theme Redesign + Draggable UI + Microinteractions

## Overview
Transform the GAPFINDER "Ethereal Glass" design system from purple/violet to orange, add draggable elements, and enhance microinteractions throughout the UI.

## Current State
- **Theme:** Dark OLED glass with violet-500 (#8b5cf6) as primary accent
- **Animation:** framer-motion v12 installed and used extensively
- **DnD:** No dedicated library - framer-motion has built-in `drag` props
- **Design system:** CSS custom properties in `src/index.css` + Tailwind CSS v4

---

## Phase 1: Orange Theme Core (CSS Variables + Tailwind Classes)

### 1.1 Update CSS Variables in `src/index.css`

| Variable | Current (Purple) | New (Orange) |
|----------|-------------------|--------------|
| `--accent-1` | `139 92 246` (violet-500) | `249 115 22` (orange-500) |
| `--accent-glow` | `0 0 40px rgb(139 92 246 / 0.3)` | `0 0 40px rgb(249 115 22 / 0.3)` |
| `--primary` | `139 92 246` | `249 115 22` |
| `--primary-light` | `167 139 250` (violet-400) | `251 146 60` (orange-400) |
| `--primary-dark` | `124 58 237` (violet-600) | `234 88 12` (orange-600) |
| `--ring` | `139 92 246` | `249 115 22` |
| `--shadow-glow` | violet glow | orange glow |
| `--mesh-purple` | violet mesh gradient | orange mesh gradient |

### 1.2 Update Hex Colors in Components

| File | Old Color | New Color |
|------|-----------|-----------|
| `index.css:352` | `#8b5cf6` / `#7c3aed` | `#f97316` / `#ea580c` |
| `AdminPage.tsx:37` | `#6366f1` | `#f97316` |
| `AnalyticsPage.tsx:87-89` | `#6366f1`, `#8b5cf6` | `#f97316`, `#fb923c` |
| `CollectionsPage.tsx:32` | `#6366f1`, `#8b5cf6` | `#f97316`, `#fb923c` |
| `server/src/db/schema.sql:195` | `#6366f1` | `#f97316` |
| `public/manifest.json:8` | `#6366f1` | `#f97316` |

### 1.3 Update Tailwind Classes Across All Components

Replace across all `.tsx` files:
- `violet-*` → `orange-*`
- `purple-*` → `orange-*`
- `indigo-*` → `orange-*`
- `from-violet-*` → `from-orange-*`
- `to-violet-*` → `to-orange-*`
- `text-violet-*` → `text-orange-*`
- `bg-violet-*` → `bg-orange-*`
- `shadow-[0_0_20px_rgb(139_92_246/0.3)]` → `shadow-[0_0_20px_rgb(249_115_22/0.3)]`

**Key files to update:**
- `ModernLayout.tsx` (sidebar, header, nav)
- `UsageIndicator.tsx`
- `AgenticResearchPage.tsx`
- `GapPredictionPage.tsx`
- `InsightsPage.tsx`
- `DatasetsPage.tsx`
- `TeamPage.tsx`
- `CompetitorPage.tsx`
- `button.tsx` (primary variant)
- `PrimeHero.tsx`
- `LoadingSpinner.tsx`

---

## Phase 2: Draggable Elements

### 2.1 Dashboard Widget Drag-and-Drop
Use framer-motion's built-in `drag` prop (no new library needed):

- Make dashboard stat cards draggable to reorder
- Add `dragConstraints` to parent, `dragElastic={0.1}`
- Show drag handle icon on hover
- Persist order via localStorage

### 2.2 Sidebar Navigation Reordering
- Allow nav items to be dragged to reorder in ModernLayout
- Visual feedback: item scales up + lifts with shadow during drag
- Snap-to-grid behavior with `dragSnapToOrigin` or constraints

### 2.3 Knowledge Graph Node Dragging
- Make graph nodes in `knowledge-graph.tsx` draggable
- Use `onDragEnd` to update node positions
- Connected edges follow nodes via `useMotionValue`

---

## Phase 3: Enhanced Microinteractions

### 3.1 Card Interactions
- **Hover:** Subtle scale(1.02) + border glow + inner content shift
- **Click:** Haptic-style press animation (scale 0.98 + bounce back)
- **Draggable cards:** Lift effect with shadow depth increase

### 3.2 Button Microinteractions
- **Hover:** Scale spring + glow pulse + icon animation
- **Click:** Magnetic pull effect toward cursor
- **Loading state:** Spinner morph with orange accent

### 3.3 Navigation Interactions
- **Hover:** Underline slide-in from left + background fade
- **Active:** Checkmark animation + color fill
- **Drag reorder:** Item lifts, others make space with spring

### 3.4 Input/Select Interactions
- **Focus:** Border glow animation + label float up
- **Error:** Shake animation + red flash
- **Success:** Checkmark morph + green flash

### 3.5 Modal/Dialog Interactions
- **Open:** Scale from trigger point + backdrop blur-in
- **Close:** Reverse with slight delay
- **Drag to dismiss:** Swipe down with velocity threshold

### 3.6 Toast/Notification Interactions
- **Enter:** Slide in from right + stack animation
- **Exit:** Swipe right + fade
- **Progress bar:** Animated countdown with orange fill

### 3.7 Data Visualization
- **Chart bars:** Animate height on mount
- **Numbers:** Count-up animation on page load
- **Trend indicators:** Arrow bounce on value change

---

## Implementation Order

1. **CSS Variables** - Update `index.css` core theme tokens
2. **Global Classes** - Update `.btn-primary`, `.gradient-text`, `.animate-glow`
3. **Component Classes** - Update Tailwind classes in all components
4. **Hex Colors** - Update hardcoded hex values
5. **Draggable Dashboard** - Add drag-to-reorder on dashboard
6. **Draggable Sidebar** - Add nav reorder capability
7. **Card Microinteractions** - Enhance hover/click/drag effects
8. **Button Microinteractions** - Add magnetic pull + glow
9. **Navigation Animations** - Add hover underline + active states
10. **Modal Animations** - Add point-origin scale + drag dismiss
11. **Toast Animations** - Enhance enter/exit/stack
12. **Data Animations** - Chart mount + count-up

---

## Files to Modify

### Core Theme
- `src/index.css` (primary - CSS variables, global classes)
- `public/manifest.json` (PWA theme color)

### Layout
- `src/components/layout/ModernLayout.tsx`
- `src/components/layout/PrimeHero.tsx`

### UI Components (30+ files)
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/select.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/skeleton.tsx`
- `src/components/ui/progress.tsx`
- `src/components/ui/LoadingSpinner.tsx`
- `src/components/ui/background-beams.tsx`
- `src/components/ui/spotlight.tsx`
- `src/components/ui/animated-tooltip.tsx`
- `src/components/ui/command-palette.tsx`
- `src/components/ui/notification-center.tsx`
- `src/components/ui/upgrade-modal.tsx`
- `src/components/ui/auth-modal.tsx`
- `src/components/AnalysisModal.tsx`
- `src/components/UsageIndicator.tsx`
- `src/components/UpgradePrompt.tsx`

### Pages (30+ files)
- `src/pages/DashboardPage.tsx` (draggable widgets)
- `src/pages/HomePage.tsx`
- `src/pages/InsightsPage.tsx`
- `src/pages/AnalyticsPage.tsx`
- `src/pages/AdminPage.tsx`
- `src/pages/CollectionsPage.tsx`
- `src/pages/TeamPage.tsx`
- `src/pages/CompetitorPage.tsx`
- `src/pages/AgenticResearchPage.tsx`
- `src/pages/GapPredictionPage.tsx`
- `src/pages/DatasetsPage.tsx`
- `src/components/ui/knowledge-graph.tsx` (draggable nodes)

### Server
- `server/src/db/schema.sql` (default collection color)

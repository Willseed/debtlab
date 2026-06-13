# LabSplit Black Gold Design System

`docs/DESIGN.md` is the source of truth for UI, UX, visual design, layout, typography, component styling, responsive behavior, and motion.

If this document conflicts with `docs/SDD.md` on visual design, this document wins.

## Design Direction

LabSplit Black Gold uses an original black-and-gold luxury dashboard style inspired by precision instrument panels and supercar cockpit ergonomics.

The implementation must not use Lamborghini logos, trademarks, copied assets, protected trade dress, or copyrighted visual assets without permission.

## Tokens

All app CSS variables must match these tokens unless this document is updated first.

```css
:root {
  --color-bg: #050505;
  --color-surface: #0b0b0b;
  --color-surface-elevated: #121212;
  --color-border: #2a2418;
  --color-border-strong: #5f4821;
  --color-gold: #d6a84f;
  --color-gold-soft: #f0d38a;
  --color-gold-muted: #8c7038;
  --color-text: #f7f3ea;
  --color-text-muted: #aaa397;
  --color-text-dim: #6f6a61;
  --color-danger: #ff4d4d;
  --color-success: #7ee787;
  --color-warning: #f2cc60;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-7: 3rem;
  --space-8: 4rem;

  --radius-sm: 2px;
  --radius-md: 6px;
  --radius-lg: 8px;

  --shadow-gold: 0 0 0 1px rgb(214 168 79 / 0.22), 0 18px 48px rgb(0 0 0 / 0.36);
  --focus-ring: 0 0 0 3px rgb(240 211 138 / 0.32);
}
```

## Typography

Use system fonts only for MVP performance.

Rules:

1. Headings are bold, precise, and compact.
2. English hero headings may use uppercase text.
3. zh-TW headings must remain natural and readable.
4. Money and dashboard numbers must use tabular numerals.
5. Letter spacing is `0` unless a component rule explicitly defines otherwise.
6. Body copy must maintain accessible contrast.

## Layout

Rules:

1. Use full-width page bands with a constrained inner width.
2. Maximum content width is `1180px`.
3. Cards are for individual repeated items and compact dashboard metrics only.
4. Do not place UI cards inside other cards.
5. Mobile layouts must remain single-column and touch friendly.
6. Fixed-format widgets need stable dimensions to prevent layout shift.

## Components

### App Shell

The shell uses a black page background, a thin gold-accent top border, and a constrained navigation area. Private links may be hidden for guests.

### Button

Primary buttons:

1. Black background.
2. Gold border.
3. Gold text.
4. Radius no larger than `8px`.
5. Visible focus ring.
6. Subtle hover glow.

Secondary buttons:

1. Elevated black surface.
2. Muted border.
3. Text color foreground.
4. Same focus behavior as primary buttons.

### Dashboard Card

Metric cards use:

1. Elevated dark surface.
2. Thin gold border.
3. Large tabular numeric value.
4. Short label.
5. No nested cards.

### Table

Tables use:

1. Semantic table markup.
2. Dark rows.
3. Minimal borders.
4. Gold hover/focus line.
5. Keyboard-accessible row actions.

### Forms

Forms use labels, hints, and error text that remain visible at mobile widths.

Inputs use:

1. Dark surface.
2. Gold focus ring.
3. Clear invalid state.
4. Native input types where possible.

### Modal

Modals use:

1. Black elevated panel.
2. Gold top border.
3. Accessible focus trap.
4. Clear primary and cancel actions.

Modal motion:

1. Backdrop fades in under `180ms`.
2. Panel fades and translates up to `10px` under `180ms`.
3. Form fields may reveal with short staggered opacity/translate transitions.
4. Reduced-motion preferences must disable these transitions.

## Motion

Allowed motion:

1. Button hover glow.
2. Card lift up to `2px`.
3. Page fade-in under `180ms`.
4. Number count-up when it does not hide state changes.
5. Easter egg effects documented here.

Avoid excessive bounce, neon overload, or motion that harms accessibility.

Reduced motion must be respected:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

## Easter Egg Visuals

Approved MVP effects:

1. `konami_gold_cockpit`: an enhanced gold border and short localized toast.
2. `midnight_lab_mode`: badge unlock state only.
3. `hidden_garage`: hidden dashboard page using the same tokens as the main app.

Easter eggs must never alter accounting values or settlement calculations.

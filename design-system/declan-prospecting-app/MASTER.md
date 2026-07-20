# Design System — Declan Prospecting App (MASTER) · v2 (owner-adjusted)

> Source: ui-ux-pro-max skill framework (priority table + dials; local database not installed —
> framework-derived, not database matches). Dials: **variance 5 · motion 4 · density 7**.
> Owner direction (2026-07-18): "like the Claude app" — calm editorial minimalism; greys & whites
> base; blue/yellow/red/green ONLY as state signals; Times New Roman; replace all emoticons.

## Style — "Claude-app minimal"
- Calm, flat, editorial: white/near-white sheets, hairline borders, soft small shadows, generous
  reading type. Glass survives ONLY as a light frost on the topbar + overlays (menus/modal/toast);
  panel sheets return to solid `--surface`. Aurora becomes a barely-there grey-blue wash (Calm
  mode still kills it). No new blur layers.
- **Icons: inline SVG sprite only** (20×20, stroke 1.75, currentColor, round caps). Emoji allowed
  in prose/empty-state copy only, never as a control's icon.

## Colour — neutral base + 4 functional hues (default palette; alt palettes remain as a feature)
- LIGHT: bg #f7f7f8 · surface #ffffff · surface2 #f1f1f2 · border #e4e4e7 · border2 #d4d4d8 ·
  text #18181b · text2 #52525b · text3 #6b7280 (4.8:1 on white).
- DARK: bg #131316 · surface #1b1b1f · surface2 #232327 · border #2a2a30 · border2 #3f3f46 ·
  text #f4f4f5 · text2 #b6b6bd · text3 #9a9aa3.
- States (light / dark fg): **info-blue** #2563eb / #60a5fa (accent + active/selected + links) ·
  **success-green** #15803d / #4ade80 · **warning-yellow** #a16207 / #fbbf24 ·
  **danger-red** #dc2626 / #f87171. Each with a matching soft bg token. Primary buttons = ink
  (near-black on light, near-white on dark), `--on-primary` inverse.
- Method wayfinding maps onto the 4 hues: justsold=blue · listed=green · buyerdb=yellow ·
  steallist=red. Entity badges (Buyers/Properties/etc.) go NEUTRAL grey — colour is reserved for
  state. All pairs ≥4.5:1 in both modes; `--text3` fixed in every alt palette too.

## Typography — Times New Roman
- Family (all UI + content): `"Times New Roman", Times, "Liberation Serif", Georgia, serif`
  (Liberation Serif = metric-compatible on Linux Mint; zero font loading).
- Scale: 12 floor (caps eyebrows +0.06em) · 13 secondary · 14 dense UI (tables/buttons/chips) ·
  **16 reading (scripts, SMS, due bodies, inputs)** · 17.5 section titles · 22 stat numbers ·
  28 page titles. Line-height ≥1.5 (1.75 for reading blocks). Serif needs slightly looser
  tracking at small caps sizes; numbers keep `font-variant-numeric: tabular-nums` where supported.

## Spacing / density (dial 7) — unchanged
`--s1 4 · --s2 8 · --s3 12 · --s4 16 · --s5 24 · --s6 32`; ≥8px between adjacent controls.

## Touch & interaction
Effective hit ≥40×40 (44 where density allows): buttons ≥36 visual, `.crm-btn-sm` ≥32 visual with
padded hit, icon buttons 40×40, ✕ clears become real 40×40 buttons, checkboxes 20px. Hover 150ms;
press scale(.98); menus fade-scale 150–200ms.

## Motion (dial 4) — unchanged
150–300ms, transform/opacity only, `backwards` fill, live reduced-motion + Calm mode.

## Accessibility gates (priority 1 — every screen)
4.5:1 everywhere; aria-labels on icon-only buttons; no clickable divs/spans — real buttons;
menus: focus moves in, arrows navigate, Escape closes, focus restores; modal focus trap + restore;
keyboard path for the attendee typeahead; visible focus ring never removed.

## Forms & feedback
Labels above; inline errors near fields; progressive disclosure (extend to buyer form); retire
native confirm() for themed modal / undo-toast; **force `en-AU` locale in electron/main.js** so
native date inputs render dd/mm/yyyy.

## Anti-patterns (enforced)
Emoji as icons · <12px text · sub-4.5:1 pairs · raw hex in components (palette blocks only) ·
width/height animation · 0ms state changes · hover-only reveals · placeholder-as-label ·
page-level horizontal scroll (component `overflow-x:auto` instead) · new blur layers ·
decorative colour on non-state elements.

## Screens
Priority: 1) Tracker 2) Inspections 3) shared chrome/SVG sweep 4) Buyers/Properties/Drops/Settings.
Overrides live in `pages/<screen>.md` as each is built. One commit per screen.

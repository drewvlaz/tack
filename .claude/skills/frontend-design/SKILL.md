---
name: frontend-design
description: Use when editing or creating UI in web/ (anything under web/src/components/, styling work, building a screen/modal/dialog, accessibility audits, color/spacing/radius decisions). Documents Tack's design tokens, reusable primitives, and the a11y rules every new component must satisfy. Load this BEFORE styling new UI so the result matches the rest of the app.
---

# Tack design system

This skill is the source of truth for visual consistency and accessibility in `web/`. New UI must compose from the tokens and primitives below — don't reach for one-off magic numbers, one-off button styles, or one-off focus rings.

## Tokens (the central config)

Two files own the design tokens. Anything visual that isn't already captured here should be added here first, then consumed via Tailwind classes / config imports — never inlined as a magic number.

**`web/src/index.css`** — CSS custom properties, registered with Tailwind v4 via `@theme inline`. Use these via Tailwind classes (`bg-surface`, `text-fg-muted`, `ring-border`, `rounded-md`, etc.).

| Family   | Tokens                                             | Usage                                                    |
| -------- | -------------------------------------------------- | -------------------------------------------------------- |
| Surfaces | `--surface`, `--surface-raised`, `--surface-muted` | App bg / cards & rails / hover & input bg                |
| Text     | `--fg`, `--fg-muted`, `--fg-subtle`                | Primary / secondary / tertiary text                      |
| Borders  | `--border`                                         | Hairlines, ring-1 borders                                |
| Semantic | `--danger`, `--danger-soft`                        | Destructive actions, validation errors                   |
| Focus    | `--focus`                                          | Required ring color for `:focus-visible`                 |
| Radius   | `--radius-sm/md/lg/xl`                             | sm: chips · md: inputs/buttons · lg: cards · xl: dialogs |
| Canvas   | `--canvas-dot`                                     | Pannable canvas dot grid (canvas only)                   |

Color tokens MUST be defined in both `:root` and `.dark`. Non-color tokens (radius) live in `:root` only.

**`web/src/config.ts`** — TypeScript constants for values consumed in JS (not CSS): motion springs (`spring.card`, `spring.panel`, `spring.panelPan`, `spring.zoom`), zoom limits, card sizing, canvas params. Used by Framer Motion `transition` props and gesture math.

The split is deliberate: CSS holds anything dark-mode-aware or styling-only; TS holds anything JS reads at runtime.

## Reusable primitives

Located in `web/src/components/shared/`. Reach for these BEFORE writing fresh Tailwind on a `<button>` / `<input>` / dialog.

| Primitive       | File                | Use for                                                                                                                                                                                                         |
| --------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`        | `Button.tsx`        | Any rectangular button. Variants: `primary` (filled), `secondary` (outlined-on-muted), `ghost` (text-only), `destructive` (danger-tinted). Sizes: `sm`, `md`. Props: `loading`, `leading`, `trailing`, `block`. |
| `IconButton`    | `IconButton.tsx`    | Round icon-only buttons. Variants: `ghost` (inside other surfaces), `raised` (floating over canvas). REQUIRES `aria-label`.                                                                                     |
| `TextField`     | `TextField.tsx`     | Labeled input. Props: `label` (required), `hideLabel`, `error`, `hint`, `trailing` (adornment slot, e.g. password eye toggle). Wires `aria-invalid` + `aria-describedby` automatically.                         |
| `ConfirmDialog` | `ConfirmDialog.tsx` | Destructive confirmation modal. Already supplies `role="dialog"`, `aria-modal`, Escape/Enter hotkeys.                                                                                                           |
| `Rail`          | `Rail.tsx`          | Resizable left/right side rail. Handles pointer-capture drag.                                                                                                                                                   |
| `UrlInputRow`   | `UrlInputRow.tsx`   | URL input + submit affordance for the canvas URL bar.                                                                                                                                                           |
| `Pulse`         | `Pulse.tsx`         | Loading shimmer.                                                                                                                                                                                                |

If you're about to add the third one-off variant of an existing primitive, generalize the primitive instead — add the variant to its API, then use it. One-off Tailwind blobs for buttons/inputs are the most common drift in this codebase; don't add more.

If a pattern doesn't have a primitive yet (Toast, Tooltip, Menu, Tabs), it's fair to keep the first instance inline — but the SECOND time you reach for the same pattern, extract a primitive into `shared/` and update this skill.

## Accessibility rules (non-negotiable)

These are checked when reviewing UI changes. None of them are optional:

1. **Focus-visible ring on every interactive element.** `outline-none` alone is forbidden — it must be paired with `focus-visible:ring-2 focus-visible:ring-focus`. The shared primitives already do this; if you write a custom `<button>`/`<a>`, add it manually.
2. **Icon-only buttons require `aria-label`.** `IconButton`'s type enforces this — don't bypass it. Toggle buttons additionally need `aria-pressed`.
3. **Form inputs need an associated label.** Use `TextField` (label baked in) or pair `<input id>` with `<label htmlFor>`. `placeholder` is NOT a label.
4. **Color contrast ≥ WCAG AA.** Body text 4.5:1, large/UI text 3:1. `fg` on `surface` and `fg-muted` on `surface-raised` pass; verify before using `fg-subtle` on `surface` for anything readers need to read (it's borderline — fine for eyebrows, not for content).
5. **Don't rely on color alone for state.** Errors get text + icon, not just red. Validation messages live in `TextField`'s `error` prop, which renders text + sets `aria-invalid`.
6. **Modals trap focus + dismiss on Escape.** `ConfirmDialog` already does this via `useHotkey('Escape', …, { scope: 'modal' })`. New modals must do the same.
7. **Touch targets ≥ 24×24px** (44×44px preferred). `Button` sizes hit this; `IconButton sm` is 28×28 hit area including padding.
8. **Reduced motion is respected.** `index.css` has a `prefers-reduced-motion` block that kills CSS transitions; Framer Motion picks up the same media query automatically. Don't write animations that ignore it.
9. **Semantic HTML.** `<button>` for actions, `<a href>` for navigation, `<header>`/`<nav>`/`<main>`/`<aside>` for layout regions, `<label>` for inputs, `<h1>`–`<h6>` in document order.
10. **No autofocus on mount unless the surface is a modal that just opened.** Surprise focus jumps disorient screen-reader users and break keyboard flow.

## Anti-patterns (do not introduce, fix when you see)

- `text-[Npx]` / `rounded-[Npx]` / `bg-#xxxxxx` — magic numbers. Add a token (or use the existing scale).
- `outline-none` without a replacement focus ring.
- An inline button styled `bg-fg text-surface rounded-md …` — that's `<Button variant="primary">`. Same for any input.
- Importing colors from anywhere other than the Tailwind classes generated from `index.css` tokens. No hex codes in components.
- `disabled` without a visual treatment — the primitives handle `disabled:opacity-50 disabled:pointer-events-none`; preserve it.
- `cursor-pointer` on `<button>` — buttons already get the correct cursor.
- Animating layout properties (`height`, `top`, `width`) without considering layout thrash. Prefer `transform` and `opacity`.

## When working on UI changes

1. Skim this doc.
2. Look at `web/src/components/shared/` — confirm no existing primitive already fits.
3. If you need a new color/radius/etc, add it to `index.css` first, then use it.
4. If you write a new primitive, add it to `shared/` and update the table above in the same change.
5. Before declaring done, run the a11y checklist on the new surface (focus ring, labels, contrast, keyboard nav, reduced motion).
6. Type checking: `pnpm lint:web`. The Tailwind class strings won't catch token typos, but a visual diff during `pnpm dev:web` will.

## Worked example

`web/src/components/auth/LoginScreen.tsx` is the canonical example of composing primitives: `TextField` + `IconButton` (for the password eye toggle, passed via `trailing`) + `Button` with `loading`. Match its shape when building new forms.

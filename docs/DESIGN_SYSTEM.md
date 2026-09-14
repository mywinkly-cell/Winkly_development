# Winkly Design System

Status: **tokens + primitives shipped, screens not yet migrated.** This is the
system every new screen should be built on; existing screens keep using the
legacy `constants/tokens.ts` until they're deliberately migrated (see
[Migration](#migration) below).

Source of truth:
- Tokens: [`apps/mobile/constants/design-system/`](../apps/mobile/constants/design-system/)
- Primitives: [`apps/mobile/components/ds/`](../apps/mobile/components/ds/)

```ts
import { useAppTheme } from "@/constants/design-system";
import { Screen, Card, PrimaryButton } from "@/components/ds";
```

## Why a second token set?

`constants/tokens.ts` (the original `Colors`/`Typography`/`Layout`/`Shadow`
exports) is still imported by ~190 existing files. Rewriting it in place would
restyle every screen in the app as a side effect of this change, which is
explicitly out of scope for this pass. `constants/design-system/` is additive:
it doesn't touch the old file, and nothing existing breaks. Screens move over
one at a time, reviewed individually — see [Migration](#migration).

---

## 1. Color

### Brand scale — `violet`

| Token | Hex | Use |
|---|---|---|
| `violet.50`–`200` | `#F7F0FC`–`#DAB8EF` | tints, selected-state backgrounds |
| `violet.500` | `#7B2CBF` | secondary brand accent |
| `violet.600` | `#5A189A` | **primary brand color** |
| `violet.700`–`900` | `#47137A`–`#240940` | pressed states, dark-mode text on light violet |

### Neutrals — `neutral`

A gray scale with a slight violet bias (hue ~265°) instead of flat iOS system
gray — this is most of what makes the palette read as "premium" rather than
default. Steps: `0, 50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 950, 1000`.

### Semantic — `semantic.success` / `semantic.warning` / `semantic.error`

Each has `base` (icon/text), `fg` (text on top of `base`), `bg` (tint for
banners/badges), `border`, plus `bgDark`/`borderDark` for dark mode.

### Per-mode accents — `modeAccents`

Romance / Friends / Business / Events each keep their existing brand color
(Identity Firewall — modes never blend), now with a matching dark-mode bg tint:

```ts
const accent = theme.modeAccent("romance"); // { primary, onPrimary, bg, border }
```

### Resolved theme — `ThemeColors`

Don't reach for `violet.600` in a screen. Reach for `theme.colors.primary`.
The semantic name is what stays stable; the hex behind it is free to change
per-theme:

| Semantic token | Light | Dark |
|---|---|---|
| `background` | `#FAF8FC` | `#14101B` |
| `surface` (cards) | `#FFFFFF` | `#211B2C` |
| `border` | `#E1DAEC` | `#362E44` |
| `textPrimary` | `#1C1330` | `#F3F0F8` |
| `textSecondary` | `#6B5F80` | `#B3A6C9` |
| `primary` | `#5A189A` | `#A466D6` (lighter, for contrast on dark) |
| `error` / `errorBg` / `errorBorder` | `#E53935` / `#FDECEA` / `#F7B7B2` | `#FF6B67` / `#3B1210` / `#6B2320` |

Full list: [`colors.ts`](../apps/mobile/constants/design-system/colors.ts) (`ThemeColors` type).

---

## 2. Typography

Fonts: **Archivo** (display/headings) + **Public Sans** (body/caption), both
loaded via `@expo-google-fonts/*` in [`app/_layout.tsx`](../apps/mobile/app/_layout.tsx).
Loaded alongside the legacy Poppins weights (still used by un-migrated
screens) — nothing was removed.

| Style | Font | Size / Line height | Weight |
|---|---|---|---|
| `display` | Archivo Bold | 36 / 44 | 700 |
| `h1` | Archivo Bold | 28 / 36 | 700 |
| `h2` | Archivo SemiBold | 22 / 29 | 600 |
| `h3` | Archivo SemiBold | 18 / 24 | 600 |
| `bodyLarge` | Public Sans Regular | 17 / 25 | 400 |
| `body` | Public Sans Regular | 15 / 22 | 400 |
| `bodyMedium` | Public Sans Medium | 15 / 22 | 500 |
| `caption` | Public Sans Regular | 13 / 18 | 400 |
| `overline` | Public Sans SemiBold | 11 / 14 | 600, +0.6 tracking |
| `button` | Public Sans SemiBold | 16 / 20 | 600 |

Usage:

```tsx
const theme = useAppTheme();
<Text style={[theme.type.h2, { color: theme.colors.textPrimary, fontFamily: theme.type.h2.fontFamily }]}>
  Title
</Text>
```

`fontFamily` has to be spread explicitly on the `Text` style in React Native —
`theme.type.h2` includes it, but RN doesn't always cascade `fontFamily` the
way `fontWeight` does, so primitives always set it directly rather than
relying on inheritance.

---

## 3. Spacing (8pt grid)

```ts
spacing.xxs // 2  — hairline gaps
spacing.xs  // 4
spacing.sm  // 8
spacing.md  // 12
spacing.lg  // 16 — default screen/card padding
spacing.xl  // 20
spacing.xxl // 24
spacing.xxxl// 32
spacing.huge    // 40
spacing.massive // 48
spacing.jumbo   // 64
```

## 4. Radii

```ts
radii.xs   // 6  — small chips, badges
radii.sm   // 10 — inputs, small buttons
radii.md   // 14 — buttons
radii.lg   // 20 — cards
radii.xl   // 28 — sheets, large modals
radii.pill // 999 — pills, avatars, fully-rounded chips
```

## 5. Elevation

Three levels, resolved automatically per theme via `theme.elevation(n)`:

| Level | Use |
|---|---|
| 1 | Cards |
| 2 | Floating action buttons, sheets |
| 3 | Modals, popovers |

Dark mode shadows barely read on dark surfaces, so `Card` falls back to a 1px
`border` in dark mode rather than relying on the shadow alone — this is
handled for you inside the `Card` primitive.

---

## Primitives (`components/ds/`)

All of these read from `useAppTheme()` internally — you never pass raw colors
or sizes into them.

| Primitive | Purpose |
|---|---|
| `Screen` | Outer wrapper: safe area, scroll, background, standard padding. `<Screen muted>`, `<Screen scroll={false}>`. |
| `Card` | Elevated surface. `elevation` 0–3, `padding` sm/md/lg/xl. |
| `SectionHeader` | In-screen section title + optional subtitle + trailing text action. |
| `PrimaryButton` / `SecondaryButton` / `TextButton` | Filled / outlined / plain actions. All support `loading`, `disabled`, `icon`. |
| `Chip` | Selectable pill (filters, tags). Pass `mode` to tint with a mode accent instead of brand violet. |
| `ListRow` | Settings/list row: `leading`, `title`/`subtitle`, `trailing`, optional chevron, `destructive`. |
| `Input` | Labeled text input with `error`/`helperText` states. |
| `Header` | Generic in-screen top bar: back button, centered title, trailing actions. (Screens using expo-router's native Stack header keep using `lib/navigation/screenOptions` instead — this is for custom in-screen headers.) |

Example:

```tsx
import { Screen, Card, SectionHeader, PrimaryButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";

function ExampleScreen() {
  const theme = useAppTheme();
  return (
    <Screen>
      <SectionHeader title="Upcoming plans" actionLabel="See all" onActionPress={() => {}} />
      <Card>
        <PrimaryButton title="Confirm" onPress={() => {}} />
      </Card>
    </Screen>
  );
}
```

---

## Enforcement

Two tools, mirroring the existing `audit-a11y` pattern — a checklist, not a
silent hard gate over the whole app (587 pre-existing hits today; failing CI
on all of them isn't useful):

```bash
npm run audit-design-tokens            # full-repo report, always exits 0
npm run audit-design-tokens -- --changed  # only files changed vs. main, exits 1 on violations
```

Wire the `--changed` form into a pre-PR check once the team is ready to hold
the line on new/edited files without blocking on the existing backlog.

The primitives in `components/ds/` are hard-enforced via `eslint.config.js` —
a hardcoded hex color or raw `fontSize` inside `components/ds/**` is an
ESLint **error**, not a warning, because that's the one place drift would
poison every screen that consumes it.

## Migration

Screens are **not** migrated onto this system yet — see the top of this doc.
When migrating a screen:

1. Replace `Colors`/`Typography`/`Layout`/`Shadow` imports from
   `@/constants/tokens` with `useAppTheme()` from `@/constants/design-system`.
2. Replace hand-rolled containers/cards/buttons with the `components/ds/`
   primitives where they fit.
3. Run `npm run audit-design-tokens -- --changed` and clear anything it flags
   in that file.
4. Spot-check the screen in both light and dark mode (dark mode is new — the
   old tokens never supported it).

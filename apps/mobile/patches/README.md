# patch-package patches

These patches are applied automatically after `npm install` / `npm ci` via the
repo-root `postinstall` hook (`patch-package --patch-dir apps/mobile/patches`).
Hoisted workspace deps live in the root `node_modules`, so patches must run from
the monorepo root — not from `apps/mobile` alone. Each entry below documents **why** the patch exists and
**when it can be removed** — re-check on every dependency bump so we don't carry
patches longer than needed.

> A patch usually signals an unresolved upstream issue. Prefer upgrading to a
> fixed release and deleting the patch over keeping it indefinitely.

## `react-native-range-slider-expo+1.4.3.patch`

**Reason — React 19 / TypeScript type incompatibilities.** The published 1.4.3
sources don't typecheck against this project's toolchain (React 19 types +
current `react-native-svg`), which fails `tsc --noEmit`. The patch:

- `src/RangeSlider.tsx` — `React.createRef<TextInput>()` →
  `React.createRef<TextInput | null>()`. React 19's `createRef` no longer
  implicitly allows `null`, so the original code errors.
- `src/components/KnobBubble.tsx` — drops the removed `Color` export from
  `react-native-svg` (now `string`) and widens the `textInputRef` type to
  `RefObject<TextInput | null>` to match the change above.

**Scope:** types only — no runtime behavior change.

**Remove when:** `react-native-range-slider-expo` ships a release with React 19
compatible types (track upstream), **or** the slider is replaced by
`@react-native-community/slider` (already a dependency) / a custom component.

---

## `decode-uri-component+0.2.2.patch`

**Reason — security (GHSA-vcc3-ghjq-m6fr).** The fallback decoder in 0.2.2 is
exponential on malformed percent-encoded input; `expo-router` runs it (via
`query-string@7`) on every incoming deep link. The fixed release 0.5.0 is
ESM-only and can't be `require`d by `query-string@7`, so the patch backports the
linear-time `decode()` from 0.5.0 into the CommonJS file.

**Scope:** fallback path only (inputs that `decodeURIComponent` rejects). Output
is unchanged for valid and malformed input; 0.2.2's `+` → space behaviour is kept.
`npm audit` still lists the package because it matches versions only.

**Remove when:** Expo SDK 58 (expo-router 58 no longer depends on `query-string`).

---

## Maintenance checklist (per dependency upgrade)

1. After bumping a patched package, delete its patch and run `npm run mobile:typecheck`.
2. If it still fails, regenerate with `npx patch-package <pkg>` and update this file.
3. Keep one `##` section per patch with: reason, scope, and removal condition.

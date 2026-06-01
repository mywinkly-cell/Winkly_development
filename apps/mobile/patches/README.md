# patch-package patches

These patches are applied automatically after `npm install` via the `postinstall`
hook (`patch-package`). Each entry below documents **why** the patch exists and
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

## Maintenance checklist (per dependency upgrade)

1. After bumping a patched package, delete its patch and run `npm run mobile:typecheck`.
2. If it still fails, regenerate with `npx patch-package <pkg>` and update this file.
3. Keep one `##` section per patch with: reason, scope, and removal condition.

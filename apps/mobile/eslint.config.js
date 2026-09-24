const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  { ignores: ["node_modules", ".expo", "dist", "coverage", "*.config.js", "jest.setup.js"] },
  // eslint-config-expo 57 pulled in eslint-plugin-react-hooks v7's new "React Compiler
  // readiness" rules as hard errors — a side effect of the SDK 57 dependency bump, not
  // a deliberate lint-policy decision. They flag ~190 existing call sites (mostly the
  // long-standing useRef(...).current lazy-init pattern and setState-in-effect resets)
  // across ~80 files. Downgraded to warn so CI stays green without a rushed, risky
  // repo-wide hook rewrite; revisit rule-by-rule when there's time to fix properly.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
  // i18n: no hard-coded user-facing text (docs/I18N.md). "warn" repo-wide so the existing
  // backlog doesn't block CI; scripts/lint-i18n-changed.mjs sets WINKLY_I18N_STRICT=1 and
  // lints only the files a PR touches, where it's an error.
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}", "providers/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    plugins: { winkly: { rules: { "no-literal-string": require("./eslint-rules/no-literal-string") } } },
    rules: {
      "winkly/no-literal-string": [
        process.env.WINKLY_I18N_STRICT === "1" ? "error" : "warn",
        // Brand names are never translated (same list as coverage-config.json's allowlist).
        { allow: ["Instagram", "Facebook", "LinkedIn", "TikTok", "WhatsApp", "Google", "Apple", "Spotify"] },
      ],
    },
  },
  // Touchable a11y: run `npm run audit-a11y` (scripts/lint-a11y-touchables.mjs) — flags unlabeled Pressable/TouchableOpacity on P0 surfaces.
  // Design tokens: run `npm run audit-design-tokens` (or `-- --changed`) for a repo-wide/changed-files checklist.
  // The design-system primitives themselves are the one place raw values are allowed to live everywhere
  // else — so they're hard-errored here to stop drift at the source.
  {
    files: ["components/ds/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^#([0-9a-fA-F]{3}){1,2}$/]",
          message: "No hardcoded hex colors in design-system primitives — add the value to constants/design-system/colors.ts instead.",
        },
        {
          selector: "Property[key.name='fontSize'][value.type='Literal']",
          message: "No raw fontSize in design-system primitives — use theme.type.<style> from constants/design-system/typography.ts instead.",
        },
      ],
    },
  },
];

const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  { ignores: ["node_modules", ".expo", "dist", "coverage", "*.config.js", "jest.setup.js"] },
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

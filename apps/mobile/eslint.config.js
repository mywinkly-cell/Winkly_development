const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  { ignores: ["node_modules", ".expo", "dist", "coverage", "*.config.js", "jest.setup.js"] },
  // Touchable a11y: run `npm run audit-a11y` (scripts/lint-a11y-touchables.mjs) — flags unlabeled Pressable/TouchableOpacity on P0 surfaces.
];

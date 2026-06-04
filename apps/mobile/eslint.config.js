const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  { ignores: ["node_modules", ".expo", "dist", "coverage", "*.config.js", "jest.setup.js"] },
];

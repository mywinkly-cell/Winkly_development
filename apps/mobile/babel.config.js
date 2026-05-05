// babel.config.js – Winkly (SDK 54)

module.exports = function (api) {
  api.cache(true);

  const isJest = Boolean(process.env.JEST_WORKER_ID);

  const plugins = isJest
    ? []
    : [
        [
          "module-resolver",
          {
            root: ["./"],
            alias: {
              "@": "./",
              "@constants": "./constants",
              "@components": "./components",
              "@lib": "./lib",
            },
          },
        ],
      ];

  // Reanimated MUST be last
  plugins.push("react-native-reanimated/plugin");

  return {
    presets: ["babel-preset-expo"],
    plugins,
  };
};

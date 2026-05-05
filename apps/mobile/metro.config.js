// metro.config.js – Winkly
// Minimal Expo Metro config, works with expo-router

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// If you later need custom asset file extensions, SVG support, etc.,
// we can extend config here. For now the default is enough.

module.exports = config;

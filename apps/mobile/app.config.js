// app.config.js – Winkly (SDK 54)

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

module.exports = {
  expo: {
    name: "Winkly",
    slug: "winkly",
    displayName: "Winkly",
    version: "1.0.0",
    orientation: "portrait",
    scheme: "winkly",
    userInterfaceStyle: "light",

    plugins: [
      "expo-localization",
      "expo-web-browser",
      "expo-apple-authentication",
      [
        "expo-notifications",
        {
          icon: "./assets/icons/winkly-emoji-shadow.png",
          color: "#7C3AED",
          sounds: [],
          enableBackgroundRemoteNotifications: false,
        },
      ],
      [
        "expo-audio",
        {
          microphonePermission:
            "Winkly uses your microphone for voice prompts on your profile and optional voice messages in chat.",
          recordAudioAndroid: true,
          enableBackgroundPlayback: true,
          enableBackgroundRecording: false
        }
      ],
      [
        "expo-calendar",
        {
          calendarPermission: "Winkly syncs your planner items with your device calendar so you never miss an event.",
          remindersPermission: "Winkly can add planner reminders to your device."
        }
      ],
      [
        "expo-contacts",
        {
          contactsPermission:
            "Winkly can match your contacts to show you who’s already on Winkly. We only send hashed identifiers for matching."
        }
      ]
    ],

    icon: "./assets/icons/winkly-emoji-shadow.png",

    splash: {
      image: "./assets/icons/winkly-emoji-shadow.png",
      resizeMode: "contain",
      backgroundColor: "#FFFFFF"
    },

    // Keep bundles lean: avoid pulling in large, rarely-used assets.
    assetBundlePatterns: [
      "assets/icons/*",
      "assets/images/*",
      "assets/fonts/*"
    ],

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.winkly.app",
      infoPlist: {
        CFBundleDisplayName: "Winkly",
        NSLocationWhenInUseUsageDescription:
          "Winkly uses your location to show nearby people and events.",
        NSCalendarsUsageDescription:
          "Winkly syncs your planner items with your calendar so you never miss an event.",
        NSRemindersUsageDescription:
          "Winkly can add planner reminders to your device."
        ,
        NSContactsUsageDescription:
          "Winkly can match your contacts to show you who’s already on Winkly. We only send hashed identifiers for matching."
      }
    },

    android: {
      package: "com.winkly.app",
      label: "Winkly",
      adaptiveIcon: {
        foregroundImage: "./assets/icons/winkly-emoji-shadow.png",
        backgroundColor: "#FFFFFF"
      },
      // Mirrors expo-notifications plugin: default icon + accent for system notifications (esp. pre-Oreo / defaults).
      notification: {
        icon: "./assets/icons/winkly-emoji-shadow.png",
        color: "#7C3AED"
      },
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "RECORD_AUDIO",
        "READ_CALENDAR",
        "WRITE_CALENDAR",
        "READ_CONTACTS"
      ]
    },

    web: {
      bundler: "metro",
      output: "single-page",
      favicon: "./assets/icons/winkly-emoji-shadow.png"
    },

    experiments: {
      typedRoutes: true
    },

    extra: {
      eas: {
        projectId: "winkly-local-dev-id"
      },
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY
    }
  }
};

// app.config.js – Winkly (SDK 54)

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Which environment this build/run targets: development | production.
// Set via .env (local) or eas.json build profile env (EAS). Defaults to development.
const APP_ENV = process.env.APP_ENV || "development";

/** Expo Push / EAS expects a real UUID project id — never use a placeholder string. */
function isLikelyUuid(value) {
  const s = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** Linked EAS project (@winkly/winkly). Override with EXPO_PUBLIC_EAS_PROJECT_ID if needed. */
const LINKED_EAS_PROJECT_ID = "5a6f6f9d-5969-4867-9572-5ee50a938066";

const easProjectId = isLikelyUuid(process.env.EXPO_PUBLIC_EAS_PROJECT_ID)
  ? String(process.env.EXPO_PUBLIC_EAS_PROJECT_ID).trim()
  : isLikelyUuid(LINKED_EAS_PROJECT_ID)
    ? LINKED_EAS_PROJECT_ID
    : undefined;

module.exports = {
  expo: {
    name: "Winkly",
    slug: "winkly",
    owner: "winkly",
    displayName: "Winkly",
    version: "1.0.0",
    orientation: "portrait",
    scheme: "winkly",
    userInterfaceStyle: "light",

    plugins: [
      "expo-dev-client",
      "expo-localization",
      "expo-web-browser",
      "expo-apple-authentication",
      // Crash reporting + source map upload. Sourcemap upload only runs when
      // SENTRY_AUTH_TOKEN/org/project are set in the EAS build env; otherwise
      // the plugin is a safe no-op. Runtime init is gated on EXPO_PUBLIC_SENTRY_DSN.
      [
        "@sentry/react-native/expo",
        {
          organization: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          url: process.env.SENTRY_URL || "https://sentry.io/",
        },
      ],
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
        ITSAppUsesNonExemptEncryption: false,
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

    // Dev client (APP_ENV=development): OTA disabled — app loads JS from Metro via `expo start --dev-client`.
    // Preview/production: embedded bundle launches first; failed OTA fetch must not block startup.
    runtimeVersion: {
      policy: "appVersion",
    },
    ...(easProjectId
      ? {
          updates: {
            url: `https://u.expo.dev/${easProjectId}`,
            enabled: APP_ENV !== "development",
            checkAutomatically: "ON_ERROR_RECOVERY",
            fallbackToCacheTimeout: 0,
          },
        }
      : {}),

    extra: {
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
      appEnv: APP_ENV,
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY
    }
  }
};

// Safe wrapper for useSafeAreaInsets — avoids ReferenceError when the package
// doesn't export the hook (e.g. some Hermes/Metro environments).

const DEFAULT_INSETS = { top: 44, bottom: 34, left: 0, right: 0 };

type Insets = typeof DEFAULT_INSETS;

let useSafeAreaInsetsImpl: () => Insets;
try {
  const sac = require("react-native-safe-area-context") as {
    useSafeAreaInsets?: () => Insets;
  };
  useSafeAreaInsetsImpl =
    typeof sac?.useSafeAreaInsets === "function"
      ? sac.useSafeAreaInsets
      : () => DEFAULT_INSETS;
} catch {
  useSafeAreaInsetsImpl = () => DEFAULT_INSETS;
}

/** Safe-area insets; falls back to defaults if the native hook isn't available. */
export function useSafeAreaInsets(): Insets {
  return useSafeAreaInsetsImpl();
}

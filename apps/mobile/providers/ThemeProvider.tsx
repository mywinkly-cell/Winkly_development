// apps/mobile/providers/ThemeProvider.tsx
// Mode-aware theming — maps active mode to accent colors

import React, { createContext, useContext } from "react";
import { useModeContext } from "./ModeContextProvider";
import { Colors } from "@/constants/tokens";
import type { Mode } from "@/types";

type ThemeTokens = {
  accent: string;
  accentSecondary: string;
  background: string;
  textPrimary: string;
  textSecondary: string;
};

const modeThemes: Record<Mode, ThemeTokens> = {
  romance: {
    accent: Colors.romance.primary,
    accentSecondary: Colors.romance.accent,
    background: Colors.backgroundLight,
    textPrimary: Colors.textPrimary,
    textSecondary: Colors.textSecondary,
  },
  friends: {
    accent: Colors.friends.primary,
    accentSecondary: Colors.friends.accent,
    background: Colors.backgroundLight,
    textPrimary: Colors.textPrimary,
    textSecondary: Colors.textSecondary,
  },
  business: {
    accent: Colors.business.primary,
    accentSecondary: Colors.business.accent,
    background: Colors.backgroundLight,
    textPrimary: Colors.textPrimary,
    textSecondary: Colors.textSecondary,
  },
  events: {
    accent: Colors.events.primary,
    accentSecondary: Colors.events.accent,
    background: Colors.backgroundLight,
    textPrimary: Colors.textPrimary,
    textSecondary: Colors.textSecondary,
  },
};

const defaultTheme: ThemeTokens = {
  accent: Colors.primaryViolet,
  accentSecondary: Colors.secondaryViolet,
  background: Colors.backgroundLight,
  textPrimary: Colors.textPrimary,
  textSecondary: Colors.textSecondary,
};

const ThemeContext = createContext<ThemeTokens>(defaultTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { context } = useModeContext();
  const theme = context.active_mode ? modeThemes[context.active_mode] : defaultTheme;

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

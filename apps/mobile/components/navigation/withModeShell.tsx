import React from "react";
import type { AppMode } from "@/lib/chats/types";
import { ModeShell } from "@/components/navigation/ModeShell";

export function withModeShell<P extends object>(mode: AppMode, Screen: React.ComponentType<P>) {
  function Wrapped(props: P) {
    return (
      <ModeShell mode={mode}>
        <Screen {...props} />
      </ModeShell>
    );
  }
  Wrapped.displayName = `ModeShell(${Screen.displayName ?? Screen.name ?? "Screen"})`;
  return Wrapped;
}

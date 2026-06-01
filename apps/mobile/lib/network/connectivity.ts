// apps/mobile/lib/network/connectivity.ts
// Connectivity store + helpers. The pure deriveIsOnline() is unit-tested; the
// module-level store lets non-React code (API clients) gate calls on network.

export type ConnectivityState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

/**
 * Online unless we have a *definite* negative signal. `null` (unknown) is
 * treated as online so we never block the first request before NetInfo has
 * reported, which would otherwise produce false "offline" errors at launch.
 */
export function deriveIsOnline(state: ConnectivityState): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

let _online = true;

/** Update the cached connectivity from a NetInfo state. Returns the new value. */
export function setConnectivity(state: ConnectivityState): boolean {
  _online = deriveIsOnline(state);
  return _online;
}

/** Latest known connectivity. Defaults to online before the first NetInfo event. */
export function isOnline(): boolean {
  return _online;
}

/** Error thrown by assertOnline() when the device is known to be offline. */
export class OfflineError extends Error {
  readonly isOffline = true;
  constructor(message = "You appear to be offline. Check your connection and try again.") {
    super(message);
    this.name = "OfflineError";
  }
}

export function isOfflineError(err: unknown): err is OfflineError {
  return Boolean((err as { isOffline?: boolean } | null)?.isOffline);
}

/** Guard for API clients: throw early (before a hanging fetch) when offline. */
export function assertOnline(): void {
  if (!_online) throw new OfflineError();
}

/** Test-only: reset the cached connectivity to the default online state. */
export function __resetConnectivity(): void {
  _online = true;
}

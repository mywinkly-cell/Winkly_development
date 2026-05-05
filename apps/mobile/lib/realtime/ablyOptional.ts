/**
 * Optional Ably pub/sub — use when EXPO_PUBLIC_ABLY_KEY is set (e.g. match notifications at scale).
 * Falls back to no-op when unset; core chat still uses Supabase Realtime.
 */

type Unsub = () => void;

export function subscribeAblyChannel(
  _channelName: string,
  _onMessage: (data: unknown) => void
): Unsub {
  const key = process.env.EXPO_PUBLIC_ABLY_KEY;
  if (!key) return () => {};
  // Dynamic import avoided to keep bundle small; wire Ably here when you add the dependency.
  console.info("Ably: subscribe skipped (add ably + EXPO_PUBLIC_ABLY_KEY to enable).");
  return () => {};
}

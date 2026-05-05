/**
 * Merge device calendar "white space" for concierge — foundation for future Google Calendar OAuth (calendar_connections).
 */

import { getFreeDaytimeSlotsForBridge, getFreeEveningSlots } from "@/lib/ai/conciergeCalendar";

/** Combined ISO start times when user likely has a gap (daytime + evening heuristic). */
export async function getMergedDeviceWhiteSpaceSlots(): Promise<string[]> {
  const [day, eve] = await Promise.all([getFreeDaytimeSlotsForBridge(), getFreeEveningSlots()]);
  const merged = [...new Set([...day, ...eve])].sort();
  return merged.slice(0, 36);
}

/** Compact string for ai-gateway `calendar_white_space` allowlist key. */
export function formatCalendarWhiteSpaceForGateway(slots: string[]): string {
  if (slots.length === 0) return "";
  return `Device calendar free-ish slot starts (ISO): ${slots.join("; ")}`;
}

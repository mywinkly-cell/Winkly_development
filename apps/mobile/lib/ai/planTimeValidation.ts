/**
 * Shared guards so a plan (AI-suggested or user-picked) can never land in the past.
 * Used across the concierge planning flow: date/time pickers (input), the ai-gateway
 * request context (generation), and suggestion / Weekly Spark filtering before a plan
 * is rendered or written to the planner (authoritative validation).
 */

export const DEFAULT_SLOT_MINUTES = 30;

/** True when both dates fall on the same calendar day (local time). */
export function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Round a moment up to the next `slotMinutes` boundary, strictly after `now`. */
export function roundUpToNextSlot(now: Date = new Date(), slotMinutes: number = DEFAULT_SLOT_MINUTES): Date {
  const d = new Date(now);
  d.setSeconds(0, 0);
  const rem = d.getMinutes() % slotMinutes;
  if (rem !== 0) {
    d.setMinutes(d.getMinutes() + (slotMinutes - rem));
  } else if (d.getTime() <= now.getTime()) {
    d.setMinutes(d.getMinutes() + slotMinutes);
  }
  return d;
}

/** Earliest date/time a user should be able to pick for a plan (use as a picker's `minimumDate`). */
export function getMinimumPlanDateTime(now: Date = new Date(), slotMinutes: number = DEFAULT_SLOT_MINUTES): Date {
  return roundUpToNextSlot(now, slotMinutes);
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * If `day` is today, clamp `time`'s hour/minute forward to the next valid slot when it has
 * already passed; a future `day` is left untouched. Only `time`'s hour/minute are read — its
 * own date component is ignored, matching how callers combine `day` + `time` downstream.
 */
export function clampTimeOfDayToFutureIfToday(day: Date, time: Date, now: Date = new Date()): Date {
  if (!isSameCalendarDay(day, now)) return time;
  const min = roundUpToNextSlot(now);
  if (minutesOfDay(time) >= minutesOfDay(min)) return time;
  const clamped = new Date(time);
  clamped.setHours(min.getHours(), min.getMinutes(), 0, 0);
  return clamped;
}

/** Combine a calendar day with an explicit hour/minute into a single Date. */
export function combineDateAndClockTime(day: Date, hour: number, minute: number): Date {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Parse the first clock time mentioned in free text ("19:00", "7:00 PM", "7 PM"). Returns null when unparseable. */
export function parseClockTimeFromText(text: string | null | undefined): { hour: number; minute: number } | null {
  if (!text) return null;
  const t = String(text);
  const match24 = t.match(/(\d{1,2}):(\d{2})/);
  const pm = /\bPM\b/i.test(t);
  const am = /\bAM\b/i.test(t);
  if (match24) {
    let hour = parseInt(match24[1], 10);
    const minute = parseInt(match24[2], 10);
    if (hour <= 23 && minute <= 59) {
      if (pm && hour < 12) hour += 12;
      if (am && hour === 12) hour = 0;
      return { hour, minute };
    }
  }
  const hMatch = t.match(/(\d{1,2})/);
  if ((pm || am) && hMatch) {
    let hour = parseInt(hMatch[1], 10) % 12;
    if (pm) hour += 12;
    return { hour, minute: 0 };
  }
  return null;
}

/**
 * Resolve the clock time that will actually be used to schedule an option: an explicit
 * `exactTimeHm` (HH:mm) wins when present, otherwise fall back to parsing the option's own
 * itinerary/schedule text. Returns null when neither yields a usable time.
 */
export function resolveOptionClockTime(params: {
  itineraryTime?: string | null;
  exactTimeHm?: string | null;
}): { hour: number; minute: number } | null {
  if (params.exactTimeHm && /^\d{2}:\d{2}$/.test(params.exactTimeHm)) {
    return {
      hour: parseInt(params.exactTimeHm.slice(0, 2), 10),
      minute: parseInt(params.exactTimeHm.slice(3, 5), 10),
    };
  }
  return parseClockTimeFromText(params.itineraryTime ?? undefined);
}

/** True when `iso` is missing (not time-bound — not our call to police) or strictly after `now`. */
export function isFutureIso(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  return t > now.getTime();
}

/**
 * Authoritative guard: drop any option whose resolved start date/time is at or before `now`.
 * `getStart` should return the option's resolved local start `Date`, or `null` when the option
 * carries no time we can judge (kept — not our failure mode to police).
 */
export function filterFuturePlanOptions<T>(
  options: T[],
  getStart: (option: T) => Date | null,
  now: Date = new Date()
): { kept: T[]; droppedCount: number } {
  const kept: T[] = [];
  let droppedCount = 0;
  for (const option of options) {
    const start = getStart(option);
    if (start && start.getTime() <= now.getTime()) {
      droppedCount++;
      continue;
    }
    kept.push(option);
  }
  return { kept, droppedCount };
}

/** Format a local wall-clock date/time (no timezone offset) as "YYYY-MM-DDTHH:mm" for AI prompts. */
export function formatLocalIsoDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

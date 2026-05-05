// ────────────────────────────────────────────────
// Chat experience suggestion — Layer 1 (precomputed) + Layer 2 (cache / on-demand LLM).
// Checks ai_plan_cache first; on miss calls concierge (with compatibility_context when available).
// ────────────────────────────────────────────────

import { callConcierge } from "@/lib/ai/conciergeClient";
import type { ExperienceOption } from "@/lib/ai/conciergeClient";
import type { Mode } from "@/types";
import {
  getCachedAiPlan,
  setCachedAiPlan,
  getCompatibilityScore,
  buildCompressedPromptFromCompatibility,
} from "@/lib/ai/compatibilityLayer";

export type ChatExperienceSuggestion = {
  title: string;
  subtitle?: string;
  /** Mini itinerary: time + activity (e.g. "12:30  Restaurant", "14:00  Gallery") */
  itinerary: { time?: string; activity: string }[];
  estimatedDuration: string;
  /** Place names for display */
  places?: string[];
  /** Cost / distance / rating if available */
  cost?: string;
  distance?: string;
  rating?: string;
  /** Raw option for "Add to planner" (concierge flow) */
  option?: ExperienceOption;
};

const ACTIVITY_HINT_BY_MODE: Record<Mode, string> = {
  romance: "first date: relaxed, safe, 2–3 hours — e.g. brunch or coffee then a walk or gallery",
  friends: "casual meetup: brunch, flea market, park walk — shared interests",
  business: "networking meetup: coffee or lunch at a coworking or café — professional",
  events: "", // not used in chat suggestions (events mode excluded)
};

function optionToSuggestion(
  opt: ExperienceOption,
  mode: Mode
): ChatExperienceSuggestion {
  const itinerary: { time?: string; activity: string }[] = [];
  if (Array.isArray(opt.itinerary) && opt.itinerary.length > 0) {
    opt.itinerary.forEach((step: { time?: string; activity?: string }) => {
      itinerary.push({
        time: step.time,
        activity: step.activity ?? (step as unknown as { place?: string }).place ?? "Activity",
      });
    });
  } else if (opt.schedule?.length) {
    opt.schedule.forEach((line: string) => {
      const match = line.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
      if (match) itinerary.push({ time: match[1], activity: match[2] });
      else itinerary.push({ activity: line });
    });
  } else {
    itinerary.push({ activity: opt.option_name ?? opt.narrative ?? "Plan" });
  }
  const title =
    mode === "romance"
      ? "Suggested first date"
      : mode === "friends"
        ? "Saturday plan"
        : "Suggested networking meetup";
  const duration =
    (opt.logistics as { estimated_duration?: string })?.estimated_duration ??
    (opt as unknown as { estimated_duration?: string }).estimated_duration ??
    "2–3 hours";
  return {
    title,
    subtitle: opt.why_this_fits ?? opt.logic_bridge ?? undefined,
    itinerary,
    estimatedDuration: duration,
    places: itinerary.map((i) => i.activity).filter(Boolean),
    cost: opt.price_indicator ?? (opt.logistics as { estimated_cost?: string })?.estimated_cost,
    option: opt,
  };
}

/**
 * Fetch one experience suggestion for a 1:1 chat.
 * Layer 2: checks ai_plan_cache first; on miss calls concierge (with Layer 1 compatibility_context when available).
 */
export async function getExperienceSuggestionForChat(params: {
  mode: Mode;
  partnerUserId: string;
  myUserId: string;
  city?: string;
  country?: string;
}): Promise<ChatExperienceSuggestion | null> {
  const { mode, partnerUserId, myUserId, city, country } = params;
  if (mode === "events") return null;

  const cached = await getCachedAiPlan(myUserId, partnerUserId, mode);
  if (cached?.itinerary?.length) {
    const title =
      mode === "romance"
        ? "Suggested first date"
        : mode === "friends"
          ? "Saturday plan"
          : "Suggested networking meetup";
    return {
      title,
      itinerary: cached.itinerary,
      estimatedDuration: cached.estimated_duration ?? "2–3 hours",
      places: cached.itinerary.map((i) => i.activity).filter(Boolean),
      cost: cached.estimated_budget,
    };
  }

  const compatibility = await getCompatibilityScore(myUserId, partnerUserId, mode);
  const compatibility_context = buildCompressedPromptFromCompatibility(compatibility ?? null, {
    city: city ?? undefined,
    suggestedTime: "Saturday lunch",
  });

  const activityHint = ACTIVITY_HINT_BY_MODE[mode];
  const res = await callConcierge({
    task: "plan",
    context: {
      mode,
      city,
      country,
      partner_user_id: partnerUserId,
      activity_hint: activityHint,
      source_screen: "chats",
      origin_context: `Chat_1:1_${mode.charAt(0).toUpperCase() + mode.slice(1)}`,
      compatibility_context: compatibility_context || undefined,
    },
  });

  if (res.error || !res.suggestions?.length) return null;

  const opt = res.suggestions[0];
  const suggestion = optionToSuggestion(opt, mode);
  await setCachedAiPlan(myUserId, partnerUserId, mode, {
    title: suggestion.title,
    itinerary: suggestion.itinerary,
    estimated_duration: suggestion.estimatedDuration,
    estimated_budget: suggestion.cost,
  }).catch(() => {});
  return suggestion;
}

import { callConcierge, type ConciergeContext } from "@/lib/ai/conciergeClient";
import type { Mode } from "@/types";

export type StrategicHostTopic = {
  title: string;
  type: "Synergy" | "Lifestyle" | "General";
  pitch: string;
};

export async function getChatStrategicHostTopics(params: {
  mode: Exclude<Mode, "events">;
  participantUserIds: string[];
  city?: string;
  country?: string;
  selectedDateTimeIso?: string;
  conversationId?: string;
}): Promise<StrategicHostTopic[]> {
  const res = await callConcierge({
    task: "chat_topics",
    context: {
      mode: params.mode,
      city: params.city,
      country: params.country,
      participant_user_ids: params.participantUserIds,
      conversation_id: params.conversationId,
      selected_date_time: params.selectedDateTimeIso,
      source_screen: "chats",
      origin_context: `Chat_${params.mode.charAt(0).toUpperCase() + params.mode.slice(1)}`,
    },
  });
  const err = (res as unknown as { error?: unknown })?.error;
  if (typeof err === "string" && err.trim()) throw new Error(err);
  const raw = (res as unknown as { suggested_topics?: StrategicHostTopic[] }).suggested_topics;
  return Array.isArray(raw) ? raw : [];
}

export type PlannerTripDaySlot = { summary: string };

export type PlannerTripDay = {
  day: number;
  date: string;
  morning: PlannerTripDaySlot;
  afternoon: PlannerTripDaySlot;
  evening?: PlannerTripDaySlot;
};

export type PlannerThemePlanOption = {
  option_id: "A" | "B";
  character_label: string;
  title: string;
  why_this_fits: string;
  itinerary: Array<{ time: string; description: string }>;
  venue: {
    name: string;
    address: string;
    google_maps_link: string;
    estimated_cost: string;
    booking_url?: string;
  };
  weather_note: string;
  duration_minutes: number;
  /** Populated for multi-day concierge trips (`num_days` > 1). */
  trip_days?: PlannerTripDay[];
};

export async function getPlannerThemePlans(params: {
  mode: Mode;
  theme: string;
  participantUserIds?: string[];
  partnerUserId?: string;
  city?: string;
  country?: string;
  dateTimeIso?: string;
  weatherForecastText?: string;
  /**
   * Full-fidelity planning context (Planner form + anonymised persona).
   * When provided, this is forwarded to ai-gateway so `plan_request_text` and other allowlisted fields reach the model.
   */
  fullContext?: ConciergeContext;
}): Promise<PlannerThemePlanOption[]> {
  const res = await callConcierge({
    task: "planner_theme_plans",
    context: {
      ...(params.fullContext ?? {}),
      // Ensure these are always consistent with this call.
      mode: params.mode,
      theme: params.theme,
      participant_user_ids: params.participantUserIds ?? params.fullContext?.participant_user_ids,
      partner_user_id: params.partnerUserId ?? params.fullContext?.partner_user_id,
      city: params.city ?? params.fullContext?.city,
      country: params.country ?? params.fullContext?.country,
      date_from: params.dateTimeIso ?? params.fullContext?.date_from,
      weather_forecast: params.weatherForecastText ?? params.fullContext?.weather_forecast,
      source_screen: "planner",
      origin_context: `Planner_${params.mode.charAt(0).toUpperCase() + params.mode.slice(1)}`,
    },
  });
  const err = (res as unknown as { error?: unknown })?.error;
  if (typeof err === "string" && err.trim()) {
    if (__DEV__) {
      console.error("[planner_theme_plans] request failed", {
        error: err,
        mode: params.mode,
        theme: params.theme,
        city: params.city ?? params.fullContext?.city,
        country: params.country ?? params.fullContext?.country,
        dateTimeIso: params.dateTimeIso ?? params.fullContext?.date_from,
        plan_request_chars: params.fullContext?.plan_request_text?.length ?? 0,
      });
    }
    throw new Error(err);
  }
  const raw = (res as unknown as { plan_options?: PlannerThemePlanOption[] }).plan_options;
  return Array.isArray(raw) ? raw : [];
}


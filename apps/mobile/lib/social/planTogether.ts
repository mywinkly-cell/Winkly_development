// Unified "Plan together" entry → co-create a Winkly event with a chat partner

import type { Router } from "expo-router";
import type { Mode } from "@/types";

export type PlanTogetherParams = {
  partnerUserId: string;
  partnerDisplayName?: string;
  sourceMode: Mode;
  conversationId?: string;
};

export function planTogetherCreateEventHref(p: PlanTogetherParams) {
  return {
    pathname: "/(modes)/events/create-event" as const,
    params: {
      partner_user_id: p.partnerUserId,
      partner_display_name: p.partnerDisplayName?.trim() ?? "",
      source_mode: p.sourceMode,
      ...(p.conversationId ? { conversation_id: p.conversationId } : {}),
    },
  };
}

export function openPlanTogetherCreateEvent(router: Router, p: PlanTogetherParams) {
  router.push(planTogetherCreateEventHref(p) as Parameters<Router["push"]>[0]);
}

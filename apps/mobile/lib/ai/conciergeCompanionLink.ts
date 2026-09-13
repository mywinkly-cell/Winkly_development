// ────────────────────────────────────────────────
// Deep link into the concierge for a specific, already-known person.
// Used by the per-card planning hint on the swipe/match surfaces: mode and
// companion are already decided, so the flow must skip straight to the
// activity step instead of asking the user to pick people or a mode again.
// ────────────────────────────────────────────────

import type { useRouter } from "expo-router";

export type CompanionConciergeMode = "friends" | "romance" | "business";

const ACTIVITY_LABEL_BY_MODE: Record<CompanionConciergeMode, string> = {
  friends: "Coffee",
  romance: "Date",
  business: "Meeting",
};

const PLANNER_TAB_BY_MODE: Record<CompanionConciergeMode, "dates" | "meetups" | "business"> = {
  romance: "dates",
  friends: "meetups",
  business: "business",
};

export function openConciergeWithCompanion(
  router: Pick<ReturnType<typeof useRouter>, "push">,
  params: { mode: CompanionConciergeMode; partnerUserId: string; partnerDisplayName: string }
) {
  const { mode, partnerUserId, partnerDisplayName } = params;
  router.push({
    pathname: "/concierge",
    params: {
      source_screen: "planner",
      source_planner_tab: PLANNER_TAB_BY_MODE[mode],
      mode,
      partner_user_id: partnerUserId,
      partner_display_name: partnerDisplayName,
      initial_step: "activity",
      proactive_activity_label: ACTIVITY_LABEL_BY_MODE[mode],
      proactive_date_preset: "today",
    },
  } as Parameters<ReturnType<typeof useRouter>["push"]>[0]);
}

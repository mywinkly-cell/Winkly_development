/**
 * Business "coming soon" waitlist — stored as an app_feedback row (owner-only RLS) so the beta
 * needs no new table. One row per user is enough; the sheet checks before offering the form.
 */

import { supabase } from "@/lib/supabase";
import { submitAppFeedback } from "@/lib/feedback/appFeedback";
import { BUSINESS_WAITLIST_SCREEN, buildBusinessWaitlistNote } from "@/lib/modes/businessWaitlist";

/** True when the signed-in user already has a waitlist row. Fails open to `false` (form shown). */
export async function hasJoinedBusinessWaitlist(): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return false;

  const { data, error } = await supabase
    .from("app_feedback")
    .select("id")
    .eq("user_id", user.id)
    .eq("screen", BUSINESS_WAITLIST_SCREEN)
    .limit(1);

  if (error) {
    console.warn("hasJoinedBusinessWaitlist:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function joinBusinessWaitlist(interests: readonly string[], text?: string): Promise<boolean> {
  return submitAppFeedback({
    note: buildBusinessWaitlistNote(interests, text),
    screen: BUSINESS_WAITLIST_SCREEN,
    mode: "business",
  });
}

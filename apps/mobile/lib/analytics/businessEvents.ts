import { track } from "@/lib/analytics";
import type { SubscriptionTier } from "@/types";

const Events = {
  business_invite_sent: "business_invite_sent",
  business_invite_accepted: "business_invite_accepted",
  business_invite_declined: "business_invite_declined",
  business_profile_viewed: "business_profile_viewed",
  business_filter_applied: "business_filter_applied",
  business_plan_meeting_tapped: "business_plan_meeting_tapped",
} as const;

export function trackBusinessInviteSent(p: {
  note_length: number;
  ai_written: boolean;
  tier: SubscriptionTier;
}) {
  track(Events.business_invite_sent, { has_note: true, ...p });
}

export function trackBusinessInviteAccepted(p: {
  connection_id: string;
  days_pending: number;
}) {
  track(Events.business_invite_accepted, p);
}

export function trackBusinessInviteDeclined(p: { report_filed: boolean }) {
  track(Events.business_invite_declined, p);
}

export function trackBusinessProfileViewed(p: {
  viewed_user_id: string;
  source: "home" | "discover" | "chats";
}) {
  track(Events.business_profile_viewed, p);
}

export function trackBusinessFilterApplied(p: {
  has_text_query: boolean;
  intent: string | null;
  role_types_count: number;
  industries_count: number;
  skills_count: number;
}) {
  track(Events.business_filter_applied, p);
}

export function trackBusinessPlanMeetingTapped(p: {
  source: "profile" | "chat";
  connection_id?: string;
  partner_user_id?: string;
}) {
  track(Events.business_plan_meeting_tapped, p);
}

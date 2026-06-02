import type { SubscriptionTier } from "@/types";

export type BusinessConnectionStatus =
  | "none"
  | "pending_sent"
  | "pending_received"
  | "accepted"
  | "declined"
  | "blocked";

export type BusinessConnectionError =
  | "NOTE_REQUIRED"
  | "DAILY_LIMIT_REACHED"
  | "PROFILE_INCOMPLETE"
  | "PENDING_QUEUE_FULL"
  | "BLOCKED_OR_COOLING_OFF"
  | "ACCOUNT_SUSPENDED";

export type BusinessProfile = {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  business_name: string;
  area: string;
  bio: string;
  location: string;
  logo_uri: string | null;
  networking_goals: string[];
  skills: string[];
  tags: string[];
  linkedin: string | null;
  website: string | null;
  instagram: string | null;
  photo_verified_at: string | null;
  mutual_count?: number;
  connection_status?: BusinessConnectionStatus;
  match_score?: number;
};

export type BusinessInvite = {
  id: string;
  from_user_id: string;
  from_profile: BusinessProfile;
  note: string;
  created_at: string;
};

export type BusinessDiscoverSort = "relevant" | "newest" | "nearest" | "mutual";

export type BusinessFeedParams = {
  query?: string;
  roleType?: string | null;
  networkingGoal?: string | null;
  skills?: string[];
  sort?: BusinessDiscoverSort;
  cursor?: string | null;
  limit?: number;
};

export type BusinessConnectResult =
  | { ok: true }
  | { ok: false; error: BusinessConnectionError; reset_at?: string };

export const BUSINESS_INVITE_DAILY_LIMITS: Record<SubscriptionTier, number> = {
  free: 5,
  super: 20,
  premium: 50,
  enterprise: 100,
};

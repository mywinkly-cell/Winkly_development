// lib/mode/subProfileProgress.ts
// Sub-profile completeness for mode-selection gating (photo + bio + goals).

import type { Mode } from "@/types";

export type ModeProgressMap = Record<Exclude<Mode, "events">, number>;

export type SubProfileRow = {
  mode: string;
  bio: string | null;
  photos: string[] | null;
  meta?: Record<string, unknown> | null;
};

const EMPTY_PROGRESS: ModeProgressMap = {
  romance: 0,
  friends: 0,
  business: 0,
};

function hasGoalsForMode(mode: string, meta: Record<string, unknown> | null | undefined): boolean {
  if (mode === "romance") {
    return Array.isArray(meta?.relationship_goals) && (meta.relationship_goals as unknown[]).length > 0;
  }
  if (mode === "friends") {
    return Array.isArray(meta?.meetup_goals) && (meta.meetup_goals as unknown[]).length > 0;
  }
  if (mode === "business") {
    const goals = meta?.networking_goals;
    return (
      (Array.isArray(goals) && goals.length > 0) ||
      (typeof goals === "string" && goals.trim().length > 0)
    );
  }
  return false;
}

/** Percent complete (0–100) per romance/friends/business from sub_profile rows. Events is always 100. */
export function computeModeProgressFromSubProfiles(rows: readonly SubProfileRow[]): ModeProgressMap {
  const p = { ...EMPTY_PROGRESS };

  for (const row of rows) {
    const hasBio = !!(row.bio?.trim?.());
    const hasPhotos = Array.isArray(row.photos) && row.photos.filter(Boolean).length > 0;
    const hasGoals = hasGoalsForMode(row.mode, row.meta);
    const percent = hasPhotos && hasBio && hasGoals
      ? 100
      : Math.round(([hasPhotos, hasBio, hasGoals].filter(Boolean).length / 3) * 100);

    if (row.mode === "romance") p.romance = percent;
    if (row.mode === "friends") p.friends = percent;
    if (row.mode === "business") p.business = percent;
  }

  return p;
}

export type ModeEntryBlockReason = "incomplete" | "not_enabled";

export function getModeEntryBlockReason(
  mode: Exclude<Mode, "events">,
  progress: ModeProgressMap,
  permissions: readonly Mode[]
): ModeEntryBlockReason | null {
  if (!permissions.includes(mode)) return "not_enabled";
  if (progress[mode] < 100) return "incomplete";
  return null;
}

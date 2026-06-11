/**
 * Business Home — map feed rows, similarity ranking, and filter helpers.
 */

import type { BusinessFiltersState } from "@/lib/filters/businessFiltersStorage";

export type BusinessPersonItem = {
  id: string;
  name: string;
  subtitle?: string;
  meta?: string;
  photoUrl?: string | null;
  tags: string[];
  /** Subset of tags shared with the viewer — highlighted on the card. */
  highlightTags?: string[];
  intentGoal?: string;
  mutualCount?: number;
};

export type BusinessViewerContext = {
  city?: string | null;
  location?: string | null;
  industries: string[];
  roles: string[];
  networkingGoals: string[];
  interests: string[];
  tags: string[];
};

function norm(s: string) {
  return s.trim().toLowerCase();
}

function tokenOverlap(a: readonly string[], b: readonly string[]): number {
  const setB = new Set(b.map(norm));
  let n = 0;
  for (const x of a) {
    const t = norm(x);
    if (t && setB.has(t)) n += 1;
  }
  return n;
}

export function mapProfilesBusinessRow(row: Record<string, unknown>): BusinessPersonItem {
  const id = String(row.id ?? "");
  const composedName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  const name =
    (row.business_name as string) ??
    (row.display_name as string) ??
    (composedName || "Professional");
  const role =
    (row.role as string) ??
    (row.role_title as string) ??
    ((row.meta as Record<string, unknown> | undefined)?.role as string | undefined);
  const company =
    (row.company_name as string) ??
    ((row.meta as Record<string, unknown> | undefined)?.company as string | undefined);
  const subtitle = [role, company, row.area].filter(Boolean).join(" · ");
  const meta = (row.location as string) ?? (row.city as string) ?? undefined;
  const networkingGoals = Array.isArray(row.networking_goals)
    ? (row.networking_goals as string[]).filter(Boolean)
    : [];
  const tags = [
    ...networkingGoals,
    ...(Array.isArray(row.skills) ? (row.skills as string[]).filter(Boolean) : []),
    ...(Array.isArray(row.tags) ? (row.tags as string[]).filter(Boolean) : []),
  ];
  const photoUrl =
    (row.logo_uri as string) ??
    (row.main_photo_url as string) ??
    (row.avatar_url as string) ??
    null;
  const intentGoal = networkingGoals[0];
  const mutualCount =
    typeof row.mutual_count === "number"
      ? row.mutual_count
      : typeof row.mutual_connections === "number"
        ? row.mutual_connections
        : 0;

  return {
    id,
    name,
    subtitle: subtitle || undefined,
    meta,
    photoUrl,
    tags,
    intentGoal,
    mutualCount,
  };
}

export function buildViewerContext(opts: {
  city?: string | null;
  location?: string | null;
  meta?: Record<string, unknown> | null;
  tags?: string[] | null;
  savedFilters?: BusinessFiltersState;
}): BusinessViewerContext {
  const meta = opts.meta ?? {};
  const industries = opts.savedFilters?.industries?.length
    ? [...opts.savedFilters.industries]
    : [];
  const roles = opts.savedFilters?.roles?.length ? [...opts.savedFilters.roles] : [];
  const networkingGoals = Array.isArray(meta.networking_goals)
    ? (meta.networking_goals as string[])
    : typeof meta.networking_goals === "string" && meta.networking_goals.trim()
      ? [meta.networking_goals.trim()]
      : opts.savedFilters?.networkingGoals ?? [];
  const interests = Array.isArray(meta.interests)
    ? (meta.interests as string[])
    : opts.savedFilters?.interests ?? [];

  const roleFromMeta =
    typeof meta.role === "string" && meta.role.trim() ? [meta.role.trim()] : [];
  const companyFromMeta =
    typeof meta.company === "string" && meta.company.trim() ? [meta.company.trim()] : [];

  return {
    city: opts.city ?? null,
    location: opts.location ?? null,
    industries,
    roles: [...roles, ...roleFromMeta],
    networkingGoals,
    interests,
    tags: [...(opts.tags ?? []), ...companyFromMeta],
  };
}

/** Higher score = more similar to the viewer's professional context. */
export function scoreBusinessSimilarity(
  viewer: BusinessViewerContext,
  candidate: BusinessPersonItem
): number {
  let score = 0;
  const hay = [candidate.name, candidate.subtitle, candidate.meta, ...candidate.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const viewerCity = norm(viewer.city ?? viewer.location ?? "");
  const candLoc = norm(candidate.meta ?? "");
  if (viewerCity && candLoc && (candLoc.includes(viewerCity) || viewerCity.includes(candLoc))) {
    score += 4;
  }

  score += tokenOverlap(viewer.industries, candidate.tags) * 2;
  score += tokenOverlap(viewer.interests, candidate.tags) * 2;
  score += tokenOverlap(viewer.networkingGoals, candidate.tags) * 2;

  for (const role of viewer.roles) {
    if (role && hay.includes(norm(role))) score += 2;
  }

  return score;
}

/** Tags this candidate shares with the viewer's professional context (for card highlighting). */
export function sharedBusinessTags(
  viewer: BusinessViewerContext,
  candidate: BusinessPersonItem
): string[] {
  const viewerSet = new Set(
    [...viewer.interests, ...viewer.industries, ...viewer.networkingGoals, ...viewer.tags].map(norm)
  );
  return candidate.tags.filter((t) => viewerSet.has(norm(t)));
}

export function rankSimilarProfiles(
  viewer: BusinessViewerContext,
  candidates: BusinessPersonItem[],
  limit = 12
): BusinessPersonItem[] {
  return [...candidates]
    .sort((a, b) => scoreBusinessSimilarity(viewer, b) - scoreBusinessSimilarity(viewer, a))
    .slice(0, limit)
    .map((c) => ({ ...c, highlightTags: sharedBusinessTags(viewer, c) }));
}


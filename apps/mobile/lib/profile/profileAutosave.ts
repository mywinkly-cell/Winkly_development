// Pure helpers for onboarding/profile autosave — no React, no Supabase.
//
// The profile screen builds ONE memoized `ProfileDraft` from every editable field
// (photos excluded — they upload on their own path). Autosave keeps a `lastSaved`
// draft next to it and only ever sends `diffProfileDraft(lastSaved, draft)`: the
// columns whose value actually changed.

export type ColumnValue = string | number | boolean | null | string[] | Record<string, unknown>;
export type ColumnMap = Record<string, ColumnValue | undefined>;

export type AutosaveMode = "romance" | "friends" | "business";
export const AUTOSAVE_MODES: readonly AutosaveMode[] = ["romance", "friends", "business"];

/** Same shape for the draft and for a patch (a patch just holds fewer columns). */
export type ProfileDraft = {
  /** public.user_profiles columns (a subset is mirrored into profiles_core on write). */
  profile: ColumnMap;
  /** public.sub_profiles columns (mirrored to profiles_mode only if already published), for enabled modes. */
  modes: Partial<Record<AutosaveMode, ColumnMap>>;
};
export type ProfilePatch = ProfileDraft;

export const AUTOSAVE_DEBOUNCE_MS = 1500;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;

export function emptyDraft(): ProfileDraft {
  return { profile: {}, modes: {} };
}

// ─────────────── dates ───────────────

/** Local-calendar yyyy-mm-dd (never UTC — a birthday must not shift a day). */
export function toISODateOnly(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parses the yyyy-mm-dd string `get_my_birthday()` returns as a LOCAL date.
 * `new Date("1990-05-15")` is UTC midnight, which reads back as May 14th in any
 * timezone west of UTC — and autosave would then write that wrong day back.
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─────────────── draft ───────────────

export type ProfileDraftInput = {
  firstName: string;
  lastName: string;
  gender: string;
  birthday: Date | null;
  /** Already normalised for storage (normalizeLocationDisplayString). */
  city: string;
  education: string;
  occupation: string;
  languages: string[];
  instagram: string;
  interests: string[];
  showFullName: boolean;

  romanceEnabled: boolean;
  friendsEnabled: boolean;
  businessEnabled: boolean;

  bioRomance: string;
  heightRomance: string;
  weightRomance: string;
  lifestyleRomance: string;
  smokingRomance: string;
  alcoholRomance: string;
  kidsRomance: string;
  sexualViewsRomance: string;
  relationshipGoalsRomance: string[];
  religionRomance: string;
  politicalViewsRomance: string;
  valuesRomance: string[];
  petsRomance: string[];
  foodRomance: string;

  bioFriends: string;
  lifestyleFriends: string;
  alcoholFriends: string;
  smokingFriends: string;
  meetupGoalsFriends: string[];
  statusFriends: string;
  kidsFriends: string;
  petsFriends: string[];
  foodFriends: string;

  bioBusiness: string;
  roleBusiness: string;
  companyBusiness: string;
  areaBusiness: string;
  networkingGoalsBusiness: string[];
  skillsBusiness: string[];
  interestsBusiness: string[];
  instagramBusiness: string;
};

const orNull = (v: string): string | null => (v.trim() ? v : null);
const trimOrNull = (v: string): string | null => v.trim() || null;
const listOrNull = (v: string[]): string[] | null => (v.length ? v : null);

/**
 * Maps every editable field to the column it is stored in. Mirrors what the
 * explicit Save writes, minus photos/videos. `first_name`/`last_name` are left
 * `undefined` while empty: they are NOT NULL, and an empty value mid-retype must
 * never be sent (undefined = "not tracked yet", see `diffProfileDraft`).
 */
export function buildProfileDraft(i: ProfileDraftInput): ProfileDraft {
  const profile: ColumnMap = {
    first_name: i.firstName.trim() || undefined,
    last_name: i.lastName.trim() || undefined,
    gender: orNull(i.gender),
    birthday: i.birthday ? toISODateOnly(i.birthday) : null,
    city: trimOrNull(i.city),
    education: orNull(i.education),
    occupation: orNull(i.occupation),
    languages: listOrNull(i.languages),
    instagram: trimOrNull(i.instagram),
    interests: listOrNull(i.interests),
    show_full_name: i.showFullName,
  };

  const modes: ProfileDraft["modes"] = {};

  if (i.romanceEnabled) {
    modes.romance = {
      bio: orNull(i.bioRomance),
      interests: listOrNull(i.interests),
      meta: {
        height: trimOrNull(i.heightRomance),
        weight: trimOrNull(i.weightRomance),
        lifestyle: orNull(i.lifestyleRomance),
        smoking: orNull(i.smokingRomance),
        alcohol: orNull(i.alcoholRomance),
        kids: orNull(i.kidsRomance),
        sexual_views: orNull(i.sexualViewsRomance),
        relationship_goals: i.relationshipGoalsRomance,
        religion: orNull(i.religionRomance),
        political_views: orNull(i.politicalViewsRomance),
        values: i.valuesRomance,
        pets: i.petsRomance,
        food: orNull(i.foodRomance),
      },
    };
  }

  if (i.friendsEnabled) {
    modes.friends = {
      bio: orNull(i.bioFriends),
      interests: listOrNull(i.interests),
      meta: {
        lifestyle: orNull(i.lifestyleFriends),
        alcohol: orNull(i.alcoholFriends),
        smoking: orNull(i.smokingFriends),
        meetup_goals: i.meetupGoalsFriends,
        status: orNull(i.statusFriends),
        kids: orNull(i.kidsFriends),
        pets: i.petsFriends,
        food: orNull(i.foodFriends),
      },
    };
  }

  if (i.businessEnabled) {
    modes.business = {
      bio: orNull(i.bioBusiness),
      interests: listOrNull(i.interestsBusiness),
      meta: {
        role: trimOrNull(i.roleBusiness),
        company: trimOrNull(i.companyBusiness),
        area: trimOrNull(i.areaBusiness),
        networking_goals: listOrNull(i.networkingGoalsBusiness),
        skills: listOrNull(i.skillsBusiness),
        interests: i.interestsBusiness,
        instagram: trimOrNull(i.instagramBusiness),
      },
    };
  }

  return { profile, modes };
}

// ─────────────── diff ───────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep equality where a missing key and `null` are the same ("nothing stored"). */
export function valuesEqual(a: unknown, b: unknown): boolean {
  const x = a === undefined ? null : a;
  const y = b === undefined ? null : b;
  if (x === y) return true;
  if (Array.isArray(x) && Array.isArray(y)) {
    return x.length === y.length && x.every((item, idx) => valuesEqual(item, y[idx]));
  }
  if (isPlainObject(x) && isPlainObject(y)) {
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) if (!valuesEqual(x[k], y[k])) return false;
    return true;
  }
  return false;
}

/** Columns of `draft` whose value differs from `saved`. `undefined` draft columns are skipped. */
function diffColumns(saved: ColumnMap | undefined, draft: ColumnMap): ColumnMap {
  const out: ColumnMap = {};
  for (const [col, value] of Object.entries(draft)) {
    if (value === undefined) continue;
    if (!valuesEqual(saved?.[col], value)) out[col] = value;
  }
  return out;
}

/** True when the mode holds something the user actually entered (not just defaults / shared interests). */
export function modeHasOwnContent(columns: ColumnMap): boolean {
  if (typeof columns.bio === "string" && columns.bio.trim()) return true;
  const meta = columns.meta;
  if (!isPlainObject(meta)) return false;
  return Object.values(meta).some((v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== ""));
}

/**
 * The columns to write so the server matches `draft`, given what was `saved`.
 *
 *  - A profile row that doesn't exist yet (saved has no first/last name) is only
 *    created once BOTH names are present — they are NOT NULL — and then with every
 *    non-empty column. Until then the profile part stays empty (deferred, not failed).
 *  - A mode row that doesn't exist yet is only created once the user has entered
 *    something in it, so merely defaulting Romance on never creates an empty row.
 */
export function diffProfileDraft(saved: ProfileDraft, draft: ProfileDraft): ProfilePatch {
  const patch: ProfilePatch = { profile: {}, modes: {} };

  const rowExists = Boolean(saved.profile.first_name) && Boolean(saved.profile.last_name);
  const canWriteProfile = rowExists || (Boolean(draft.profile.first_name) && Boolean(draft.profile.last_name));
  if (canWriteProfile) patch.profile = diffColumns(saved.profile, draft.profile);

  for (const mode of AUTOSAVE_MODES) {
    const next = draft.modes[mode];
    if (!next) continue;
    const prev = saved.modes[mode];
    if (!prev && !modeHasOwnContent(next)) continue;
    const columns = diffColumns(prev, next);
    if (Object.keys(columns).length) patch.modes[mode] = columns;
  }

  return patch;
}

export function isPatchEmpty(patch: ProfilePatch): boolean {
  return Object.keys(patch.profile).length === 0 && Object.keys(patch.modes).length === 0;
}

/** `saved` after `persisted` (the part of a patch that reached the server) was written. */
export function applyPatch(saved: ProfileDraft, persisted: ProfilePatch): ProfileDraft {
  const modes: ProfileDraft["modes"] = { ...saved.modes };
  for (const mode of AUTOSAVE_MODES) {
    const columns = persisted.modes[mode];
    if (columns) modes[mode] = { ...saved.modes[mode], ...columns };
  }
  return { profile: { ...saved.profile, ...persisted.profile }, modes };
}

/**
 * Initial `lastSaved` once hydration is done: what the server already holds is
 * the hydrated draft for rows that exist, and nothing for rows that don't (so a
 * draft restored from local storage, never uploaded, still gets pushed).
 */
export function seedSavedDraft(
  hydrated: ProfileDraft,
  existing: { profileRow: boolean; modeRows: readonly AutosaveMode[] }
): ProfileDraft {
  const modes: ProfileDraft["modes"] = {};
  for (const mode of existing.modeRows) {
    const columns = hydrated.modes[mode];
    if (columns) modes[mode] = columns;
  }
  return { profile: existing.profileRow ? hydrated.profile : {}, modes };
}

/** Exponential backoff for failed autosaves: 2s, 4s, 8s, 16s, then 30s. `attempt` is 1-based. */
export function retryDelayMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(RETRY_BASE_MS * 2 ** (n - 1), RETRY_MAX_MS);
}

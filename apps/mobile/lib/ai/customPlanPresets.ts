/**
 * Profile-aware planning suggestions (chips) for Custom plan activity details.
 * Merges profiles_core, all profiles_mode rows (interests + real meta keys), concierge signals, and planner history.
 */

import type { Mode } from "@/types";
import { supabase } from "@/lib/supabase";
import { getOwnProfileCore, getOwnProfileBusiness, getOwnProfileMode } from "@/lib/access/profiles";
import { getMyConciergeSignals } from "@/lib/ai/preferenceEngine";

const MODE_FALLBACKS: Record<Mode, string[]> = {
  romance: [
    "Cozy dinner for two",
    "Coffee date somewhere new",
    "Evening walk & dessert",
    "Wine bar with good atmosphere",
    "Something cultural nearby",
  ],
  friends: [
    "Group brunch this weekend",
    "Casual drinks downtown",
    "Outdoor hangout",
    "Games or sports together",
    "Try a new neighborhood spot",
  ],
  business: [
    "Coffee meeting — quiet & professional",
    "Lunch near the office",
    "Networking-friendly venue",
    "Working session with good Wi‑Fi",
    "Industry-relevant event nearby",
  ],
  events: [
    "Live music or show",
    "Weekend festival or fair",
    "Workshop or talk",
    "Night out — dancing or club",
    "Community meetup",
  ],
};

function uniqPush(pool: string[], s: string) {
  const t = s.trim();
  if (!t) return;
  const lower = t.toLowerCase();
  if (pool.some((x) => x.toLowerCase() === lower)) return;
  pool.push(t);
}

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function metaStringList(meta: Record<string, unknown>, keys: string[]): string[] {
  const out: string[] = [];
  for (const k of keys) {
    const v = meta[k];
    if (Array.isArray(v)) {
      for (const x of v) {
        if (typeof x === "string" && x.trim()) out.push(x.trim());
      }
    } else if (typeof v === "string" && v.trim()) {
      out.push(v.trim());
    }
  }
  return out;
}

/** Split comma/newline/semicolon lists and dedupe case-insensitively. */
export function expandInterestTokens(raw: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (typeof r !== "string" || !r.trim()) continue;
    const parts = r.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    const toAdd = parts.length ? parts : [r.trim()];
    for (const p of toAdd) {
      const low = p.toLowerCase();
      if (seen.has(low)) continue;
      seen.add(low);
      out.push(p);
    }
  }
  return out;
}

export type PlanningProfileContext = {
  mode: Mode;
  city?: string | null;
  /**
   * Cache key derived from profile/signals updated_at values.
   * This lets the app keep "profile-based suggestions" in memory until the user changes profile fields.
   */
  profileVersion?: string;
  /** Approximate age from profiles_core birthday — for concierge persona line only (no name/email). */
  ageYears?: number | null;
  interests: string[];
  lifestyleTags: string[];
  hobbies: string[];
  goalsLine?: string;
  recentPlanTitles: string[];
  occupation?: string | null;
  bioSnippet?: string | null;
  languages?: string[];
  conciergePrefer?: string[];
  conciergeAvoid?: string[];
  /** From `user_concierge_signals` — business / networking angles. */
  conciergeProfessionalTopics?: string[];
  /** From `user_concierge_signals` — venue energy preference. */
  conciergeNoiseLevel?: "low" | "medium" | "high";
  /** Short lines derived from mode meta (relationship goal, meetup style, networking, etc.) */
  profileMetaLines?: string[];
};

function ageFromBirthday(birthday: string | null | undefined): number | null {
  if (!birthday) return null;
  const d = new Date(birthday);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * Single sanitized block for USER_REQUEST: age, area, interests, lifestyle, goals — never name, email, or phone.
 * Used alongside server-side PRIMARY_USER (same minimization rules).
 */
export function formatSanitizedPersonaForConciergePrompt(ctx: PlanningProfileContext): string {
  const bits: string[] = [];
  if (ctx.ageYears != null && ctx.ageYears >= 18 && ctx.ageYears <= 120) {
    bits.push(`Approx. age: ${ctx.ageYears}`);
  }
  if (ctx.city?.trim()) {
    bits.push(`Home base / area: ${clip(ctx.city.replace(/\s+/g, " "), 80)}`);
  }
  if (ctx.interests.length) {
    bits.push(`Interests: ${clip(ctx.interests.slice(0, 10).join(", "), 180)}`);
  }
  if (ctx.lifestyleTags.length) {
    bits.push(`Lifestyle tags: ${clip(ctx.lifestyleTags.slice(0, 8).join(", "), 140)}`);
  }
  if (ctx.hobbies.length) {
    bits.push(`Hobbies / activities: ${clip(ctx.hobbies.slice(0, 8).join(", "), 140)}`);
  }
  if (ctx.goalsLine) bits.push(`Goals (${ctx.mode}): ${clip(ctx.goalsLine, 100)}`);
  if (ctx.profileMetaLines?.length) {
    bits.push(clip(ctx.profileMetaLines.slice(0, 4).join(" · "), 220));
  }
  if (ctx.conciergePrefer?.length) bits.push(`Venue prefs: ${clip(ctx.conciergePrefer.join(", "), 100)}`);
  if (ctx.conciergeProfessionalTopics?.length) {
    bits.push(`Professional topics: ${clip(ctx.conciergeProfessionalTopics.join(", "), 100)}`);
  }
  if (ctx.conciergeNoiseLevel) bits.push(`Venue energy: ${ctx.conciergeNoiseLevel}`);
  if (ctx.conciergeAvoid?.length) bits.push(`Avoid: ${clip(ctx.conciergeAvoid.join(", "), 80)}`);
  if (ctx.languages?.length) bits.push(`Languages: ${clip(ctx.languages.slice(0, 5).join(", "), 60)}`);
  return bits.length ? bits.join(" | ") : "Persona: minimal profile data on file — infer from topic and location only.";
}

type ModeRow = {
  mode: string;
  interests: string[] | null;
  lifestyle_tags: string[] | null;
  meta: Record<string, unknown> | null;
  updated_at?: string | null;
};

type ConciergeSignalsRow = { updated_at?: string | null; signals?: Record<string, unknown> | null };

function collectMetaLinesFromRows(rows: ModeRow[], activeMode: Mode): string[] {
  const lines: string[] = [];
  const push = (s: string) => uniqPush(lines, s);

  for (const r of rows) {
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    const m = r.mode;

    if (m === "romance") {
      if (typeof meta.relationship_goal === "string" && meta.relationship_goal.trim()) {
        push(`Relationship goal: ${clip(meta.relationship_goal, 52)}`);
      }
      if (typeof meta.what_you_value === "string" && meta.what_you_value.trim()) {
        const first = meta.what_you_value.split(/[\n.]+/).map((x) => x.trim()).filter(Boolean)[0];
        if (first) push(`Values: ${clip(first, 52)}`);
      }
    }
    if (m === "friends") {
      if (typeof meta.meetup_style === "string" && meta.meetup_style.trim()) {
        push(`Meetup style: ${clip(meta.meetup_style, 52)}`);
      }
      if (typeof meta.availability === "string" && meta.availability.trim()) {
        push(`Availability: ${clip(meta.availability, 48)}`);
      }
    }
    if (m === "business") {
      if (typeof meta.networking_goal === "string" && meta.networking_goal.trim()) {
        push(`Networking: ${clip(meta.networking_goal, 52)}`);
      }
      const role = typeof meta.role === "string" ? meta.role.trim() : "";
      const company = typeof meta.company === "string" ? meta.company.trim() : "";
      if (role && company) push(`${clip(role, 28)} at ${clip(company, 28)}`);
      else if (company) push(clip(company, 48));
      else if (role) push(clip(role, 48));
      if (typeof meta.skills === "string" && meta.skills.trim()) {
        const sk = meta.skills.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).slice(0, 3);
        if (sk.length) push(`Skills: ${sk.join(", ")}`);
      }
    }

    // Legacy / alternate keys (onboarding or older saves)
    for (const bit of metaStringList(meta, ["relationship_goals", "meetup_goals", "networking_goals"])) {
      push(clip(bit, 56));
    }
  }

  // Prefer lines that match active mode first (reorder)
  const primary = lines.filter((l) => {
    if (activeMode === "romance") return l.startsWith("Relationship") || l.startsWith("Values:");
    if (activeMode === "friends") return l.startsWith("Meetup") || l.startsWith("Availability:");
    if (activeMode === "business") return l.startsWith("Networking:") || l.includes(" at ") || l.startsWith("Skills:");
    return true;
  });
  const rest = lines.filter((l) => !primary.includes(l));
  return [...primary, ...rest];
}

function buildGoalsLine(rows: ModeRow[], activeMode: Mode): string | undefined {
  const row = rows.find((r) => r.mode === activeMode);
  const meta = (row?.meta ?? {}) as Record<string, unknown>;
  if (activeMode === "romance") {
    const g = typeof meta.relationship_goal === "string" ? meta.relationship_goal.trim() : "";
    if (g) return clip(g, 80);
  }
  if (activeMode === "friends") {
    const g = typeof meta.meetup_style === "string" ? meta.meetup_style.trim() : "";
    if (g) return clip(g, 80);
  }
  if (activeMode === "business") {
    const g = typeof meta.networking_goal === "string" ? meta.networking_goal.trim() : "";
    if (g) return clip(g, 80);
  }
  const rg = meta.relationship_goals;
  const mg = meta.meetup_goals;
  const ng = meta.networking_goals;
  const goalBits = [rg, mg, ng]
    .filter((x) => typeof x === "string" && x.trim())
    .map((x) => String(x).trim());
  if (goalBits.length) return clip(goalBits.slice(0, 2).join(" · "), 80);
  return undefined;
}

/** Loads merged profile + recent planner titles for suggestion chips. */
export async function loadPlanningProfileContext(userId: string, mode: Mode): Promise<PlanningProfileContext> {
  const [core, modeRowsResult, conciergeRow, plannerResult, modeRowSingle, businessProfile] = await Promise.all([
    getOwnProfileCore(userId),
    supabase.from("profiles_mode").select("mode, interests, lifestyle_tags, meta, updated_at").eq("user_id", userId),
    supabase.from("user_concierge_signals").select("updated_at, signals").eq("user_id", userId).maybeSingle(),
    supabase
      .from("planner_items")
      .select("title")
      .eq("created_by", userId)
      .order("starts_at", { ascending: false })
      .limit(10),
    getOwnProfileMode(userId, mode),
    mode === "business" ? getOwnProfileBusiness(userId) : Promise.resolve(null),
  ]);

  const rows = (modeRowsResult.data ?? []) as ModeRow[];
  /** Ensure active mode row is present (RLS/sync edge cases) for meta lines + goals. */
  let effectiveRows: ModeRow[] = [...rows];
  if (modeRowSingle && !effectiveRows.some((r) => r.mode === mode)) {
    effectiveRows.push({
      mode,
      interests: modeRowSingle.interests ?? null,
      lifestyle_tags: modeRowSingle.lifestyle_tags ?? null,
      meta: (modeRowSingle.meta as Record<string, unknown> | null) ?? null,
    });
  }

  const interestRaw: string[] = [];
  const lifestyleRaw: string[] = [];
  const hobbyRaw: string[] = [];

  const pushRowIntoPools = (r: ModeRow) => {
    if (Array.isArray(r.interests)) {
      for (const x of r.interests) {
        if (typeof x === "string" && x.trim()) interestRaw.push(x);
      }
    }
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    if (Array.isArray(meta.interests)) {
      for (const x of meta.interests) {
        if (typeof x === "string" && x.trim()) interestRaw.push(x);
      }
    }
    if (Array.isArray(r.lifestyle_tags)) {
      for (const t of r.lifestyle_tags) {
        if (typeof t === "string" && t.trim()) lifestyleRaw.push(t.trim());
      }
    }
    hobbyRaw.push(...metaStringList(meta, ["hobbies", "activity_tags", "sports_tags", "creative_tags"]));
  };

  /** Active mode first so chips prioritize what the user set for this planner context. */
  const activeRow = effectiveRows.find((r) => r.mode === mode);
  const otherRows = effectiveRows.filter((r) => r.mode !== mode);
  if (activeRow) pushRowIntoPools(activeRow);
  for (const r of otherRows) pushRowIntoPools(r);

  if (businessProfile && mode === "business") {
    if (Array.isArray(businessProfile.tags)) {
      for (const t of businessProfile.tags) {
        if (typeof t === "string" && t.trim()) hobbyRaw.push(t.trim());
      }
    }
    if (typeof businessProfile.bio === "string" && businessProfile.bio.trim()) {
      hobbyRaw.push(clip(businessProfile.bio, 80));
    }
  }

  const interests = expandInterestTokens(interestRaw);
  const lifestyleTags = expandInterestTokens(lifestyleRaw);
  const hobbies = expandInterestTokens(hobbyRaw);

  const profileMetaLines = collectMetaLinesFromRows(effectiveRows, mode);
  const goalsLine = buildGoalsLine(effectiveRows, mode)
    ?? (businessProfile?.bio && mode === "business" ? clip(String(businessProfile.bio), 80) : undefined);

  const recentPlanTitles = (plannerResult.data ?? [])
    .map((r) => String((r as { title?: string }).title ?? "").trim())
    .filter(Boolean)
    .slice(0, 5);

  const bio = typeof core?.bio === "string" ? core.bio.trim() : "";
  const bioSnippet = bio.length > 12 ? clip(bio.replace(/\s+/g, " "), 100) : null;

  const rawLangs = core?.languages;
  const langs = Array.isArray(rawLangs)
    ? rawLangs.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0 && x !== "Any")
    : [];

  const concierge = (conciergeRow?.data as ConciergeSignalsRow | null)?.signals as
    | { avoid?: string[]; prefer?: string[]; noise_level?: unknown; professional_topics?: unknown }
    | undefined;
  const prefer = (concierge?.prefer ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 4);
  const avoid = (concierge?.avoid ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 3);
  const profTopicsRaw = concierge?.professional_topics;
  const profTopicsArr =
    Array.isArray(profTopicsRaw) ? profTopicsRaw : typeof profTopicsRaw === "string" ? [profTopicsRaw] : [];
  const profTopics = profTopicsArr
    .map((x: unknown) => String(x).trim())
    .filter(Boolean)
    .slice(0, 5);
  const noiseLevel =
    concierge?.noise_level === "low" || concierge?.noise_level === "medium" || concierge?.noise_level === "high"
      ? (concierge.noise_level as "low" | "medium" | "high")
      : undefined;
  const ageYears = ageFromBirthday(core?.birthday ?? null);

  const coreUpdatedAt = typeof (core as { updated_at?: unknown } | null)?.updated_at === "string"
    ? String((core as { updated_at?: string }).updated_at)
    : "";
  const modeUpdatedMax = effectiveRows
    .map((r) => (typeof r.updated_at === "string" ? r.updated_at : ""))
    .filter(Boolean)
    .sort()
    .slice(-1)[0] ?? "";
  const signalsUpdatedAt =
    typeof (conciergeRow?.data as { updated_at?: unknown } | null)?.updated_at === "string"
      ? String((conciergeRow!.data as { updated_at?: string }).updated_at)
      : "";
  const businessUpdatedAt =
    mode === "business" && typeof (businessProfile as { updated_at?: unknown } | null)?.updated_at === "string"
      ? String((businessProfile as { updated_at?: string }).updated_at)
      : "";
  const profileVersion = [coreUpdatedAt, modeUpdatedMax, signalsUpdatedAt, businessUpdatedAt].filter(Boolean).join("|");

  return {
    mode,
    city: core?.city ?? null,
    profileVersion: profileVersion || undefined,
    ageYears,
    interests,
    lifestyleTags,
    hobbies,
    goalsLine,
    recentPlanTitles,
    occupation: core?.occupation ?? null,
    bioSnippet,
    languages: langs,
    conciergePrefer: prefer.length ? prefer : undefined,
    conciergeAvoid: avoid.length ? avoid : undefined,
    conciergeProfessionalTopics: profTopics.length ? profTopics : undefined,
    conciergeNoiseLevel: noiseLevel,
    profileMetaLines,
  };
}

type ScoredChip = { text: string; weight: number };

type ChipSeed = {
  interests: string[];
  hobbies: string[];
  lifestyle: string[];
};

/** Turn stored meta lines into short, plan-oriented chip copy. */
function metaLineToPlanChip(line: string, mode: Mode): string {
  const s = line.trim();
  const rel = /^Relationship goal:\s*(.+)$/i.exec(s);
  if (rel) return `Plan that fits my dating goal: ${clip(rel[1].trim(), 42)}`;
  const val = /^Values:\s*(.+)$/i.exec(s);
  if (val) return `Reflect what I value: ${clip(val[1].trim(), 42)}`;
  const ms = /^Meetup style:\s*(.+)$/i.exec(s);
  if (ms) return `Hangout matching my style: ${clip(ms[1].trim(), 42)}`;
  const av = /^Availability:\s*(.+)$/i.exec(s);
  if (av) return `Works with my availability: ${clip(av[1].trim(), 40)}`;
  const net = /^Networking:\s*(.+)$/i.exec(s);
  if (net) return `Networking aim: ${clip(net[1].trim(), 42)}`;
  const sk = /^Skills:\s*(.+)$/i.exec(s);
  if (sk) return `Leverage my skills: ${clip(sk[1].trim(), 42)}`;
  return clip(s, 52);
}

function interestToPlanChip(mode: Mode, token: string): string {
  const t = clip(token.trim(), 36);
  if (!t) return "";
  switch (mode) {
    case "romance":
      return `Date idea around: ${t}`;
    case "friends":
      return `Meetup with ${t} in mind`;
    case "business":
      return `Plan tied to ${t} professionally`;
    case "events":
      return `Something aligned with ${t}`;
    default:
      return `Built around ${t}`;
  }
}

function noiseLevelChip(level: "low" | "medium" | "high"): string {
  if (level === "low") return "Quieter venue — easy conversation";
  if (level === "high") return "Lively / buzzy atmosphere is OK";
  return "Balanced vibe — not too loud";
}

/** Weight band for location + interests + lifestyle + hobbies (must rank above all other signals). */
const W_LOCATION = 300;
const W_INTEREST_BASE = 297;
const W_LIFESTYLE_BASE = 296;
const W_HOBBY_BASE = 292;
/** Combined signals should beat any single token. */
const W_COMBINED_BASE = 299;
/** Everything else stays below this ceiling so core profile fields always win when present. */
const W_SECONDARY_CEILING = 199;

function seededIndexPick(seed: string, maxExclusive: number): number {
  // Deterministic, fast, stable across sessions for same seed.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = (h >>> 0) % Math.max(1, maxExclusive);
  return n;
}

function normalizeTokens(tokens: string[], max: number): string[] {
  return tokens
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, max);
}

function buildChipSeed(ctx: PlanningProfileContext): ChipSeed {
  return {
    interests: normalizeTokens(ctx.interests, 10),
    hobbies: normalizeTokens(ctx.hobbies, 10),
    lifestyle: normalizeTokens(ctx.lifestyleTags, 10),
  };
}

function tokenLooksLikeFoodDrink(t: string): boolean {
  return /(coffee|café|cafe|brunch|dinner|wine|cocktail|beer|tea|sushi|pizza|taco|vegan|vegetarian|food|dessert)/i.test(t);
}
function tokenLooksLikeOutdoorFitness(t: string): boolean {
  return /(hike|hiking|walk|running|run|gym|yoga|pilates|fitness|climb|cycling|bike|trail|swim|tennis|padel|ski|snow|surf|beach|outdoor)/i.test(t);
}
function tokenLooksLikeCulture(t: string): boolean {
  return /(museum|art|gallery|theatre|theater|cinema|film|concert|live music|jazz|classical|book|books|reading|poetry|history|culture)/i.test(t);
}
function tokenLooksLikeCreative(t: string): boolean {
  return /(photography|photo|painting|draw|design|music|guitar|piano|dance|cooking|baking|craft|writing)/i.test(t);
}

function buildCombinedChips(ctx: PlanningProfileContext, seed: ChipSeed): ScoredChip[] {
  const out: ScoredChip[] = [];
  const mode = ctx.mode;
  const noise = ctx.conciergeNoiseLevel;
  const preferQuiet = noise === "low";
  const preferLively = noise === "high";

  const pool = [...seed.interests, ...seed.hobbies, ...seed.lifestyle];
  const food = pool.filter(tokenLooksLikeFoodDrink);
  const outdoor = pool.filter(tokenLooksLikeOutdoorFitness);
  const culture = pool.filter(tokenLooksLikeCulture);
  const creative = pool.filter(tokenLooksLikeCreative);

  const pick = (arr: string[], fallback: string) =>
    arr.length ? arr[seededIndexPick(`${ctx.profileVersion ?? ""}|${ctx.city ?? ""}|${arr.join(",")}|${fallback}`, arr.length)] : fallback;

  // 1) Strong “plan-shaped” chips per mode, combining 2 signals when possible.
  if (mode === "romance") {
    if (outdoor.length) {
      const t = pick(outdoor, outdoor[0] ?? "");
      out.push({ text: `Active date: ${clip(t, 22)} + cozy place after`, weight: W_COMBINED_BASE });
    }
    if (culture.length) {
      const t = pick(culture, culture[0] ?? "");
      out.push({ text: `Culture date: ${clip(t, 24)} then a dessert stop`, weight: W_COMBINED_BASE - 2 });
    }
    if (food.length) {
      const t = pick(food, food[0] ?? "");
      out.push({ text: `Foodie date inspired by ${clip(t, 22)}`, weight: W_COMBINED_BASE - 4 });
    }
    if (preferQuiet) out.push({ text: "Low-key date: quiet bar or cozy café for real conversation", weight: W_COMBINED_BASE - 6 });
    if (preferLively) out.push({ text: "Buzzy date: lively spot + something fun nearby after", weight: W_COMBINED_BASE - 6 });
  } else if (mode === "friends") {
    if (outdoor.length) {
      const t = pick(outdoor, outdoor[0] ?? "");
      out.push({ text: `Friend hang: ${clip(t, 24)} then casual food`, weight: W_COMBINED_BASE });
    }
    if (creative.length) {
      const t = pick(creative, creative[0] ?? "");
      out.push({ text: `Creative catch-up: ${clip(t, 24)} + a chill café`, weight: W_COMBINED_BASE - 2 });
    }
    if (culture.length) {
      const t = pick(culture, culture[0] ?? "");
      out.push({ text: `Go out plan: ${clip(t, 26)} + drinks after`, weight: W_COMBINED_BASE - 4 });
    }
    if (preferQuiet) out.push({ text: "Easy talk vibe: quieter bar or café, not too loud", weight: W_COMBINED_BASE - 6 });
  } else if (mode === "business") {
    const prof = (ctx.conciergeProfessionalTopics ?? []).map((x) => x.trim()).filter(Boolean);
    if (prof.length) {
      const t = pick(prof, prof[0] ?? "");
      out.push({ text: `Networking angle: ${clip(t, 28)} + introductions`, weight: W_COMBINED_BASE });
    }
    if (ctx.occupation?.trim()) {
      out.push({ text: `Meeting format for ${clip(ctx.occupation.trim(), 26)}: quiet coffee + agenda`, weight: W_COMBINED_BASE - 2 });
    }
    out.push({
      text: preferQuiet ? "Quiet, professional venue with Wi‑Fi (easy to talk)" : "Business-friendly spot (good seating + low friction)",
      weight: W_COMBINED_BASE - 4,
    });
  } else {
    // events (or fallback)
    if (culture.length) {
      const t = pick(culture, culture[0] ?? "");
      out.push({ text: `Event night around ${clip(t, 26)} + after spot`, weight: W_COMBINED_BASE });
    }
    if (outdoor.length) {
      const t = pick(outdoor, outdoor[0] ?? "");
      out.push({ text: `Day event + activity: ${clip(t, 26)} nearby`, weight: W_COMBINED_BASE - 2 });
    }
  }

  // 2) Use goals/meta as “steering” chips (non-generic, but short).
  if (ctx.goalsLine?.trim()) {
    out.push({ text: `Make it fit: ${clip(ctx.goalsLine.trim(), 48)}`, weight: W_SECONDARY_CEILING - 6 });
  }
  if ((ctx.profileMetaLines?.length ?? 0) > 0) {
    const line = ctx.profileMetaLines![0];
    const text = metaLineToPlanChip(line, ctx.mode);
    if (text) out.push({ text, weight: W_SECONDARY_CEILING - 8 });
  }

  return out;
}

/**
 * Five ranked suggestions from merged profile + concierge signals.
 * **Location** (city), **interests**, **lifestyle tags**, and **hobbies** use the highest weights; then goals,
 * concierge prefs, meta, history, etc.; generic fallbacks last.
 */
export function buildProfileAwareSuggestionChips(ctx: PlanningProfileContext): string[] {
  const cityFirst = (ctx.city || "").split(",")[0]?.trim() ?? "";
  const candidates: ScoredChip[] = [];
  const seed = buildChipSeed(ctx);

  if (cityFirst) {
    candidates.push({ text: `New spots in ${cityFirst}`, weight: W_LOCATION });
    candidates.push({ text: `Weekend ideas in ${cityFirst}`, weight: W_LOCATION - 2 });
  }

  // Combined, plan-shaped chips first (strongest personalization).
  for (const c of buildCombinedChips(ctx, seed)) candidates.push(c);

  for (let i = 0; i < ctx.interests.length && i < 6; i++) {
    const raw = ctx.interests[i];
    const text = interestToPlanChip(ctx.mode, typeof raw === "string" ? raw : "");
    if (text) candidates.push({ text, weight: W_INTEREST_BASE - i * 2 });
  }

  for (let i = 0; i < ctx.lifestyleTags.length && i < 4; i++) {
    const raw = ctx.lifestyleTags[i];
    const t = typeof raw === "string" ? raw.trim() : "";
    if (!t) continue;
    candidates.push({
      text: `Lifestyle fit: ${clip(t, 36)}`,
      weight: W_LIFESTYLE_BASE - i * 2,
    });
  }

  for (let i = 0; i < ctx.hobbies.length && i < 4; i++) {
    const h = ctx.hobbies[i];
    if (typeof h !== "string" || !h.trim()) continue;
    const ht = h.trim();
    const prefix =
      tokenLooksLikeOutdoorFitness(ht) ? "Active" :
      tokenLooksLikeCulture(ht) ? "Culture" :
      tokenLooksLikeFoodDrink(ht) ? "Food/drink" :
      tokenLooksLikeCreative(ht) ? "Creative" :
      "Inspired";
    candidates.push({ text: `${prefix}: ${clip(ht, 38)}`, weight: W_HOBBY_BASE - i * 2 });
  }

  for (const p of ctx.conciergePrefer ?? []) {
    candidates.push({ text: `Prefer: ${clip(p, 46)}`, weight: W_SECONDARY_CEILING });
  }

  for (let i = 0; i < (ctx.profileMetaLines ?? []).length && i < 5; i++) {
    const line = ctx.profileMetaLines![i];
    const text = metaLineToPlanChip(line, ctx.mode);
    if (text) candidates.push({ text, weight: W_SECONDARY_CEILING - 2 - i * 2 });
  }

  if (ctx.goalsLine?.trim()) {
    candidates.push({ text: `Honor my goals: ${clip(ctx.goalsLine.trim(), 48)}`, weight: W_SECONDARY_CEILING - 14 });
  }

  for (let i = 0; i < (ctx.conciergeProfessionalTopics ?? []).length && i < 3; i++) {
    const t = ctx.conciergeProfessionalTopics![i];
    candidates.push({ text: `Professional angle: ${clip(t, 42)}`, weight: W_SECONDARY_CEILING - 16 - i });
  }

  if (ctx.conciergeNoiseLevel) {
    candidates.push({ text: noiseLevelChip(ctx.conciergeNoiseLevel), weight: W_SECONDARY_CEILING - 22 });
  }

  if (ctx.occupation?.trim() && ctx.mode === "business") {
    candidates.push({ text: `Right for ${clip(ctx.occupation.trim(), 38)}`, weight: W_SECONDARY_CEILING - 24 });
  }

  for (const title of ctx.recentPlanTitles.slice(0, 3)) {
    candidates.push({ text: `Similar to a past plan: ${clip(title, 40)}`, weight: W_SECONDARY_CEILING - 28 });
  }

  if ((ctx.languages?.length ?? 0) >= 2) {
    candidates.push({
      text: `Language practice (${clip(ctx.languages!.slice(0, 3).join(", "), 36)})`,
      weight: W_SECONDARY_CEILING - 32,
    });
  }

  if (ctx.bioSnippet && (ctx.interests.length < 2 || (ctx.profileMetaLines?.length ?? 0) < 1)) {
    candidates.push({ text: `Match my intro: ${clip(ctx.bioSnippet, 44)}`, weight: W_SECONDARY_CEILING - 36 });
  }

  for (const a of ctx.conciergeAvoid ?? []) {
    candidates.push({ text: `Avoid: ${clip(a, 40)}`, weight: W_SECONDARY_CEILING - 42 });
  }

  for (const f of MODE_FALLBACKS[ctx.mode] ?? MODE_FALLBACKS.events) {
    candidates.push({ text: f, weight: 12 });
  }

  candidates.sort((a, b) => b.weight - a.weight);

  const seen = new Set<string>();
  const pool: string[] = [];
  for (const c of candidates) {
    const lo = c.text.toLowerCase();
    if (!c.text.trim() || seen.has(lo)) continue;
    seen.add(lo);
    pool.push(c.text);
    if (pool.length >= 5) break;
  }

  return pool.slice(0, 5);
}

type ChipsCacheEntry = { profileVersion: string; chips: string[] };
const chipsCache = new Map<string, ChipsCacheEntry>();

/**
 * Return 5 suggestion chips, cached in-memory until the user's profile/signals change.
 * This is the "keep in memory unless a user change something" behavior.
 */
export async function loadProfileAwareSuggestionChips(
  userId: string,
  mode: Mode
): Promise<{ chips: string[]; ctx: PlanningProfileContext }> {
  const ctx = await loadPlanningProfileContext(userId, mode);
  const version = ctx.profileVersion ?? "";
  const key = `${userId}|${mode}`;
  const cached = chipsCache.get(key);
  if (cached && cached.profileVersion && cached.profileVersion === version && cached.chips.length === 5) {
    return { chips: cached.chips, ctx };
  }
  const chips = buildProfileAwareSuggestionChips(ctx);
  if (version) chipsCache.set(key, { profileVersion: version, chips });
  return { chips, ctx };
}

/** @deprecated Use loadPlanningProfileContext + buildProfileAwareSuggestionChips */
export function buildCustomPlanChipOptions(params: {
  mode: Mode;
  city?: string | null;
  interests?: string[] | null;
  lifestyleTags?: string[] | null;
}): string[] {
  const ctx: PlanningProfileContext = {
    mode: params.mode,
    city: params.city ?? null,
    ageYears: null,
    interests: params.interests ?? [],
    lifestyleTags: params.lifestyleTags ?? [],
    hobbies: [],
    recentPlanTitles: [],
  };
  return buildProfileAwareSuggestionChips(ctx);
}

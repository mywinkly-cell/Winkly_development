/**
 * Image moderation — pure decision logic (no Deno / network imports).
 *
 * Every vendor adapter turns its raw response into a flat map of normalised
 * `signals` (0..1, higher = more likely unsafe). A per-vendor `ModerationPolicy`
 * then maps signals to one of three outcomes:
 *
 *   pass   → visible to everyone it would normally be visible to
 *   review → held: visible only to the uploader, queued for manual review
 *   block  → rejected; the object is deleted
 *
 * FAIL CLOSED: anything we cannot interpret (vendor down, timeout, auth error,
 * unexpected response shape) becomes "review" — never "pass".
 *
 * Kept import-free so the mobile Jest suite can unit-test it directly
 * (apps/mobile/__tests__/mediaModeration.test.ts).
 */

export type ModerationStatus = "pass" | "review" | "block";

export type ModerationSignals = Record<string, number>;

export type PolicyRule = {
  /** Signal key, e.g. "nudity.sexual_activity". */
  signal: string;
  /** Score at/above which the image is held for manual review. */
  review?: number;
  /** Score at/above which the image is rejected outright. */
  block?: number;
};

export type ModerationPolicy = PolicyRule[];

export type ModerationDecision = {
  status: ModerationStatus;
  /** Human-readable rule hits, e.g. "nudity.sexual_activity=0.91>=0.5:block". */
  reasons: string[];
};

/** Thrown by the parsers when a vendor response can't be trusted. Callers fail closed. */
export class ModerationProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModerationProviderError";
  }
}

const RANK: Record<ModerationStatus, number> = { pass: 0, review: 1, block: 2 };

/** Apply a policy to a set of signals. The most severe rule hit wins. */
export function decide(signals: ModerationSignals, policy: ModerationPolicy): ModerationDecision {
  let status: ModerationStatus = "pass";
  const reasons: string[] = [];
  for (const rule of policy) {
    const score = signals[rule.signal];
    if (typeof score !== "number" || Number.isNaN(score)) continue;
    let hit: ModerationStatus | null = null;
    if (rule.block !== undefined && score >= rule.block) hit = "block";
    else if (rule.review !== undefined && score >= rule.review) hit = "review";
    if (!hit) continue;
    const threshold = hit === "block" ? rule.block : rule.review;
    reasons.push(`${rule.signal}=${round(score)}>=${threshold}:${hit}`);
    if (RANK[hit] > RANK[status]) status = hit;
  }
  return { status, reasons };
}

/** The decision used whenever the vendor could not give us a trustworthy answer. */
export function failClosedDecision(reason: string): ModerationDecision {
  return { status: "review", reasons: [`provider_unavailable:${reason}`] };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function obj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Option A — Sightengine (dedicated trust-and-safety vendor, France / EU)
// Models: nudity-2.1, gore-2.0, violence, weapon, recreational_drug, self-harm
// https://sightengine.com/docs/models
// ─────────────────────────────────────────────────────────────────────────────

export const SIGHTENGINE_MODELS = "nudity-2.1,gore-2.0,violence,weapon,recreational_drug,self-harm";

/**
 * Dating-app tuned: swimwear / cleavage / "suggestive" is allowed; explicit sexual
 * content, gore, real violence, threatening weapons and self-harm are not.
 */
export const SIGHTENGINE_POLICY: ModerationPolicy = [
  { signal: "nudity.sexual_activity", review: 0.2, block: 0.5 },
  { signal: "nudity.sexual_display", review: 0.2, block: 0.5 },
  { signal: "nudity.erotica", review: 0.4, block: 0.7 },
  { signal: "nudity.very_suggestive", review: 0.85 },
  { signal: "gore.prob", review: 0.3, block: 0.6 },
  { signal: "violence.physical_violence", review: 0.3, block: 0.6 },
  { signal: "violence.firearm_threat", review: 0.3, block: 0.6 },
  { signal: "weapon.aiming_threat", review: 0.3, block: 0.6 },
  { signal: "weapon.firearm", review: 0.6 },
  { signal: "weapon.knife", review: 0.8 },
  { signal: "recreational_drug.prob", review: 0.6, block: 0.9 },
  { signal: "self_harm.prob", review: 0.3, block: 0.6 },
];

/** Normalise a Sightengine check.json response. Throws ModerationProviderError if untrustworthy. */
export function sightengineSignals(json: unknown): ModerationSignals {
  const r = obj(json);
  if (!r || r.status !== "success") {
    const err = obj(r?.error);
    throw new ModerationProviderError(`sightengine status=${String(r?.status)} ${String(err?.message ?? "")}`.trim());
  }
  const nudity = obj(r.nudity);
  // Nudity is the category we can least afford to silently miss — its absence means
  // the request/model config is wrong, so refuse to "pass" on partial data.
  if (!nudity) throw new ModerationProviderError("sightengine response missing nudity");

  const s: ModerationSignals = {};
  const put = (k: string, v: unknown) => {
    const n = num(v);
    if (n !== undefined) s[k] = n;
  };
  for (const k of ["sexual_activity", "sexual_display", "erotica", "very_suggestive", "suggestive", "none"]) {
    put(`nudity.${k}`, nudity[k]);
  }
  const gore = obj(r.gore);
  put("gore.prob", gore?.prob);
  const violence = obj(r.violence);
  put("violence.prob", violence?.prob);
  const vClasses = obj(violence?.classes);
  put("violence.physical_violence", vClasses?.physical_violence);
  put("violence.firearm_threat", vClasses?.firearm_threat);
  const weapon = obj(r.weapon);
  const wClasses = obj(weapon?.classes);
  put("weapon.firearm", wClasses?.firearm);
  put("weapon.knife", wClasses?.knife);
  put("weapon.aiming_threat", obj(weapon?.firearm_action)?.aiming_threat);
  put("recreational_drug.prob", obj(r.recreational_drug)?.prob);
  put("self_harm.prob", obj(r["self-harm"])?.prob);
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Option B — Google Cloud Vision SafeSearch (EU regional endpoint)
// https://cloud.google.com/vision/docs/detecting-safe-search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Likelihood → score. UNKNOWN maps to 0.5 ("possible") so an un-assessable adult
 * or violence verdict lands in review rather than passing.
 */
export const SAFESEARCH_LIKELIHOOD: Record<string, number> = {
  VERY_UNLIKELY: 0,
  UNLIKELY: 0.25,
  POSSIBLE: 0.5,
  LIKELY: 0.75,
  VERY_LIKELY: 1,
  UNKNOWN: 0.5,
};

export const SAFESEARCH_POLICY: ModerationPolicy = [
  { signal: "adult", review: 0.5, block: 0.75 },
  { signal: "violence", review: 0.5, block: 1 },
  { signal: "racy", review: 1 },
  { signal: "medical", review: 1 },
];

/** Normalise a Vision images:annotate response (single request). */
export function safeSearchSignals(json: unknown): ModerationSignals {
  const r = obj(json);
  const first = Array.isArray(r?.responses) ? obj((r!.responses as unknown[])[0]) : undefined;
  if (!first) throw new ModerationProviderError("vision response missing responses[0]");
  const err = obj(first.error);
  if (err) throw new ModerationProviderError(`vision error: ${String(err.message ?? err.code ?? "unknown")}`);
  const ann = obj(first.safeSearchAnnotation);
  if (!ann) throw new ModerationProviderError("vision response missing safeSearchAnnotation");
  const s: ModerationSignals = {};
  for (const k of ["adult", "violence", "racy", "medical", "spoof"]) {
    const v = ann[k];
    s[k] = typeof v === "string" && v in SAFESEARCH_LIKELIHOOD ? SAFESEARCH_LIKELIHOOD[v] : SAFESEARCH_LIKELIHOOD.UNKNOWN;
  }
  return s;
}

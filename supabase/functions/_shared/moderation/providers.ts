/**
 * Image moderation — vendor adapters behind one interface.
 *
 * Select with the MODERATION_PROVIDER secret:
 *   sightengine   (default, recommended) — SIGHTENGINE_API_USER, SIGHTENGINE_API_SECRET
 *   google_vision                        — GOOGLE_VISION_API_KEY,
 *                                          GOOGLE_VISION_ENDPOINT (default https://eu-vision.googleapis.com)
 *   mock          (dev/staging ONLY)     — MODERATION_ALLOW_MOCK=true (required) and
 *                                          MODERATION_MOCK_VERDICT = pass | review | block | down
 *
 * To add a vendor: implement ModerationProvider (return normalised signals + a policy),
 * register it in getModerationProvider(). Nothing else changes.
 *
 * `moderateImage()` is the only entry point callers use. It never throws and
 * never returns "pass" unless a vendor positively said so (fail closed).
 */

import {
  decide,
  failClosedDecision,
  ModerationProviderError,
  SAFESEARCH_POLICY,
  safeSearchSignals,
  SIGHTENGINE_MODELS,
  SIGHTENGINE_POLICY,
  sightengineSignals,
  type ModerationDecision,
  type ModerationPolicy,
  type ModerationSignals,
  type ModerationStatus,
} from "./decision.ts";

export interface ModerationProvider {
  readonly name: string;
  readonly policy: ModerationPolicy;
  /** Return normalised signals. Throw on any doubt — the caller fails closed. */
  analyze(bytes: Uint8Array, mimeType: string): Promise<ModerationSignals>;
}

export type ModerationResult = ModerationDecision & {
  provider: string;
  signals: ModerationSignals;
  /** True when the vendor could not be reached / understood and we held the image. */
  failedClosed: boolean;
};

const TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

class SightengineProvider implements ModerationProvider {
  readonly name = "sightengine";
  readonly policy = SIGHTENGINE_POLICY;
  constructor(private user: string, private secret: string) {}

  async analyze(bytes: Uint8Array, mimeType: string): Promise<ModerationSignals> {
    const form = new FormData();
    form.append("media", new Blob([bytes], { type: mimeType }), "image");
    form.append("models", SIGHTENGINE_MODELS);
    form.append("api_user", this.user);
    form.append("api_secret", this.secret);
    const res = await fetchWithTimeout("https://api.sightengine.com/1.0/check.json", { method: "POST", body: form });
    if (!res.ok) throw new ModerationProviderError(`sightengine http ${res.status}`);
    return sightengineSignals(await res.json());
  }
}

class GoogleVisionProvider implements ModerationProvider {
  readonly name = "google_vision";
  readonly policy = SAFESEARCH_POLICY;
  constructor(private apiKey: string, private endpoint: string) {}

  async analyze(bytes: Uint8Array): Promise<ModerationSignals> {
    const res = await fetchWithTimeout(`${this.endpoint}/v1/images:annotate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        requests: [{ image: { content: toBase64(bytes) }, features: [{ type: "SAFE_SEARCH_DETECTION" }] }],
      }),
    });
    if (!res.ok) throw new ModerationProviderError(`vision http ${res.status}`);
    return safeSearchSignals(await res.json());
  }
}

/** Dev/staging only: deterministic verdicts for the "done when" checks without real content. */
class MockProvider implements ModerationProvider {
  readonly name = "mock";
  readonly policy: ModerationPolicy = [{ signal: "mock", review: 0.5, block: 1 }];
  constructor(private verdict: string) {}

  analyze(): Promise<ModerationSignals> {
    if (this.verdict === "down") return Promise.reject(new ModerationProviderError("mock provider down"));
    const score: Record<string, number> = { pass: 0, review: 0.5, block: 1 };
    return Promise.resolve({ mock: score[this.verdict] ?? 0.5 });
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Returns the configured provider, or null when misconfigured (→ fail closed). */
export function getModerationProvider(): ModerationProvider | null {
  const which = (Deno.env.get("MODERATION_PROVIDER") ?? "sightengine").toLowerCase();
  if (which === "sightengine") {
    const u = Deno.env.get("SIGHTENGINE_API_USER");
    const s = Deno.env.get("SIGHTENGINE_API_SECRET");
    return u && s ? new SightengineProvider(u, s) : null;
  }
  if (which === "google_vision") {
    const key = Deno.env.get("GOOGLE_VISION_API_KEY");
    const endpoint = (Deno.env.get("GOOGLE_VISION_ENDPOINT") ?? "https://eu-vision.googleapis.com").replace(/\/$/, "");
    return key ? new GoogleVisionProvider(key, endpoint) : null;
  }
  if (which === "mock") {
    // Double opt-in so a stray MODERATION_PROVIDER=mock can never silently pass everything in prod.
    if (Deno.env.get("MODERATION_ALLOW_MOCK") !== "true") return null;
    return new MockProvider((Deno.env.get("MODERATION_MOCK_VERDICT") ?? "pass").toLowerCase());
  }
  return null;
}

export async function moderateImage(bytes: Uint8Array, mimeType: string): Promise<ModerationResult> {
  const provider = getModerationProvider();
  if (!provider) {
    return { ...failClosedDecision("not_configured"), provider: "none", signals: {}, failedClosed: true };
  }
  try {
    const signals = await provider.analyze(bytes, mimeType);
    return { ...decide(signals, provider.policy), provider: provider.name, signals, failedClosed: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ...failClosedDecision(msg.slice(0, 200)), provider: provider.name, signals: {}, failedClosed: true };
  }
}

export type { ModerationStatus };

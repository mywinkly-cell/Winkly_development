/**
 * Provider price table and cost estimation (COST-2, August 2026 audit).
 *
 * ai_requests recorded no tokens and no money, so cost per user was unknowable
 * — which is also the input the Year-1 financial model is most sensitive to.
 *
 * Everything here is in **micro-euros** (1 EUR = 1_000_000 micros) so the
 * aggregate path in Postgres is integer-only. These are estimates from list
 * prices, not invoices: use them for ratios, caps and anomaly detection, and
 * reconcile against the provider bill monthly.
 *
 * Prices are USD per million tokens on the provider pages; USD_PER_EUR converts.
 * Override any of it with the AI_PRICE_TABLE_JSON secret rather than editing
 * this file, so a price change does not need a deploy:
 *
 *   AI_PRICE_TABLE_JSON={"gemini-3.5-flash":{"in":0.30,"out":2.50}}
 */

export type ModelPrice = {
  /** USD per 1M input tokens. */
  in: number;
  /** USD per 1M output tokens. */
  out: number;
};

const USD_PER_EUR = Number(Deno.env.get("AI_USD_PER_EUR") ?? "1.08") || 1.08;

/**
 * List prices as of August 2026. Verify against the provider pricing pages when
 * you change models — a wrong number here makes the caps wrong, not the calls.
 */
const DEFAULT_PRICES: Record<string, ModelPrice> = {
  // Google Generative Language API
  "gemini-3.5-flash": { in: 0.30, out: 2.50 },
  "gemini-3.1-flash-lite": { in: 0.10, out: 0.40 },
  // Anthropic Messages API
  "claude-sonnet-4-20250514": { in: 3.00, out: 15.00 },
  "claude-3-5-haiku-20241022": { in: 0.80, out: 4.00 },
};

/**
 * Fallback for a model we have no price for — deliberately pessimistic, so an
 * unpriced model shows up as expensive rather than free and trips a cap early.
 */
const UNKNOWN_MODEL_PRICE: ModelPrice = { in: 3.00, out: 15.00 };

let cachedTable: Record<string, ModelPrice> | null = null;

function priceTable(): Record<string, ModelPrice> {
  if (cachedTable) return cachedTable;
  cachedTable = { ...DEFAULT_PRICES };
  const raw = Deno.env.get("AI_PRICE_TABLE_JSON")?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, ModelPrice>;
      for (const [model, price] of Object.entries(parsed)) {
        if (typeof price?.in === "number" && typeof price?.out === "number") {
          cachedTable[model] = { in: price.in, out: price.out };
        }
      }
    } catch (err) {
      console.error("[pricing] AI_PRICE_TABLE_JSON is not valid JSON — using defaults:", err);
    }
  }
  return cachedTable;
}

/** True when we have a real list price for this model rather than the pessimistic fallback. */
export function isModelPriced(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(priceTable(), model);
}

/**
 * Estimated cost of one provider call, in micro-euros.
 * Returns 0 for a zero-token call so cache hits stay free.
 */
export function estimateCostMicros(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const inTok = Number.isFinite(inputTokens) && inputTokens > 0 ? inputTokens : 0;
  const outTok = Number.isFinite(outputTokens) && outputTokens > 0 ? outputTokens : 0;
  if (inTok === 0 && outTok === 0) return 0;

  const price = priceTable()[model] ?? UNKNOWN_MODEL_PRICE;
  if (!isModelPriced(model)) {
    console.warn(`[pricing] no price for model "${model}" — charging the pessimistic fallback`);
  }

  const usd = (inTok / 1_000_000) * price.in + (outTok / 1_000_000) * price.out;
  const eur = usd / USD_PER_EUR;
  return Math.max(0, Math.round(eur * 1_000_000));
}

/** Human-readable euros, for logs and error messages. */
export function microsToEur(micros: number): string {
  return (micros / 1_000_000).toFixed(4);
}

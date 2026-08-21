/**
 * Per-request token/cost ledger (COST-2, August 2026 audit).
 *
 * The gateway can make several provider calls while serving one request (a
 * retry, a fallback to a second provider, a two-stage plan). Threading a usage
 * object through every call site of a 5,000-line handler would be a large and
 * risky change, so instead each request runs inside an AsyncLocalStorage scope
 * and the provider wrappers add to whatever ledger is current.
 *
 * Design rule: **this module must never be able to break a request.** Every
 * entry point is wrapped so that a missing AsyncLocalStorage, a provider
 * response in an unexpected shape, or anything else degrades to "no usage
 * recorded" — which is exactly the behaviour before this file existed.
 */

import { estimateCostMicros } from "./pricing.ts";

export type UsageColumns = {
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_micros: number | null;
  cached: boolean;
};

type Ledger = {
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  calls: number;
  cached: boolean;
};

function emptyLedger(): Ledger {
  return {
    provider: null,
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    costMicros: 0,
    calls: 0,
    cached: false,
  };
}

// AsyncLocalStorage comes from node:async_hooks, which Deno supports. If that
// import ever fails we fall back to a no-op store rather than taking the
// function down — cost tracking is observability, not correctness.
type Store = {
  run<T>(ledger: Ledger, fn: () => T): T;
  getStore(): Ledger | undefined;
};

let store: Store | null = null;

try {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  store = new AsyncLocalStorage<Ledger>() as unknown as Store;
} catch (err) {
  console.warn("[usage] AsyncLocalStorage unavailable — AI cost tracking disabled:", err);
  store = null;
}

/** Wrap one request so provider calls inside it accumulate into a fresh ledger. */
export function withUsageLedger<T>(fn: () => Promise<T>): Promise<T> {
  if (!store) return fn();
  try {
    return store.run(emptyLedger(), fn);
  } catch (err) {
    console.warn("[usage] ledger scope failed — continuing untracked:", err);
    return fn();
  }
}

function current(): Ledger | null {
  if (!store) return null;
  try {
    return store.getStore() ?? null;
  } catch {
    return null;
  }
}

/**
 * Record one provider call. Safe to call with garbage — anything unparseable is
 * counted as a call with zero tokens rather than throwing.
 */
export function recordProviderUsage(params: {
  provider: string;
  model: string;
  inputTokens: unknown;
  outputTokens: unknown;
}): void {
  try {
    const ledger = current();
    if (!ledger) return;

    const inTok = Number(params.inputTokens);
    const outTok = Number(params.outputTokens);
    const safeIn = Number.isFinite(inTok) && inTok > 0 ? Math.round(inTok) : 0;
    const safeOut = Number.isFinite(outTok) && outTok > 0 ? Math.round(outTok) : 0;

    ledger.calls += 1;
    ledger.provider = params.provider;
    ledger.model = params.model;
    ledger.inputTokens += safeIn;
    ledger.outputTokens += safeOut;
    ledger.costMicros += estimateCostMicros(params.model, safeIn, safeOut);
  } catch (err) {
    console.warn("[usage] recordProviderUsage failed — ignoring:", err);
  }
}

/** Mark this request as served from cache (no provider call was made). */
export function markServedFromCache(): void {
  try {
    const ledger = current();
    if (ledger) ledger.cached = true;
  } catch { /* ignore */ }
}

/** Micro-euros spent so far in this request. Used by the per-request guard. */
export function currentRequestCostMicros(): number {
  return current()?.costMicros ?? 0;
}

/**
 * Columns to spread into an ai_requests insert. When nothing was recorded the
 * values are null, which is exactly what the table held before COST-2.
 */
export function usageColumns(): UsageColumns {
  const ledger = current();
  if (!ledger || (ledger.calls === 0 && !ledger.cached)) {
    return {
      provider: null,
      model: null,
      input_tokens: null,
      output_tokens: null,
      cost_micros: null,
      cached: false,
    };
  }
  return {
    provider: ledger.provider,
    model: ledger.model,
    input_tokens: ledger.calls > 0 ? ledger.inputTokens : null,
    output_tokens: ledger.calls > 0 ? ledger.outputTokens : null,
    cost_micros: ledger.calls > 0 ? ledger.costMicros : 0,
    cached: ledger.cached,
  };
}

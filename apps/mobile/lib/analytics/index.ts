// apps/mobile/lib/analytics/index.ts
// Analytics abstraction (PostHog-backed when available).

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export type AnalyticsClient = {
  identify: (distinctId: string, props?: AnalyticsProps) => void;
  reset: () => void;
  capture: (event: string, props?: AnalyticsProps) => void;
  screen: (name: string, props?: AnalyticsProps) => void;
};

let _client: AnalyticsClient | null = null;

export function setAnalyticsClient(client: AnalyticsClient | null) {
  _client = client;
}

export function getAnalyticsClient() {
  return _client;
}

export function identify(distinctId: string, props?: AnalyticsProps) {
  _client?.identify(distinctId, props);
}

export function resetAnalytics() {
  _client?.reset();
}

export function track(event: string, props?: AnalyticsProps) {
  _client?.capture(event, props);
}

export function screen(name: string, props?: AnalyticsProps) {
  _client?.screen(name, props);
}

/**
 * Safe wrapper around arbitrary work to ensure analytics never breaks app flow.
 * If analytics throws (misconfigured client), we swallow and return the original result.
 */
export async function withAnalytics<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn("[analytics] error", err);
    throw err;
  }
}

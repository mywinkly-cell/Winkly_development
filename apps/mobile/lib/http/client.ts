// Shared HTTP client (axios) for non-Supabase REST calls.
// Supabase uses its own fetch wrapper in lib/supabase.ts (offline guard + Android localhost fix).

import axios, { type AxiosError, type AxiosRequestConfig } from "axios";
import { assertOnline, isOfflineError } from "@/lib/network/connectivity";

const DEFAULT_TIMEOUT_MS = 30_000;

export const httpClient = axios.create({
  timeout: DEFAULT_TIMEOUT_MS,
  headers: { Accept: "application/json" },
});

httpClient.interceptors.request.use((config) => {
  assertOnline();
  return config;
});

export type HttpErrorKind = "offline" | "timeout" | "network" | "http" | "unknown";

export function classifyHttpError(err: unknown): HttpErrorKind {
  if (isOfflineError(err)) return "offline";
  if (!axios.isAxiosError(err)) return "unknown";
  const ax = err as AxiosError;
  if (ax.code === "ECONNABORTED" || ax.message?.toLowerCase().includes("timeout")) return "timeout";
  if (ax.response) return "http";
  if (ax.request) return "network";
  return "unknown";
}

/** GET with offline guard and default timeout. */
export async function httpGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await httpClient.get<T>(url, config);
  return res.data;
}

/** POST JSON with offline guard and default timeout. */
export async function httpPost<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  const res = await httpClient.post<T>(url, body, {
    headers: { "Content-Type": "application/json", ...config?.headers },
    ...config,
  });
  return res.data;
}

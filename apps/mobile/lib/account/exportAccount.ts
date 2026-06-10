// Winkly — Request GDPR data export (calls export-account Edge Function)

import { supabase } from "@/lib/supabase";

export type ExportAccountResult =
  | { ok: true; url: string; expiresAt: string; expiresInSeconds: number }
  | { error: string; retryAfterHours?: number };

export type RequestAccountExportOptions = {
  analyticsConsent?: {
    cookiesAccepted: boolean;
    source?: string;
  };
};

export async function requestAccountExport(
  options: RequestAccountExportOptions = {},
): Promise<ExportAccountResult> {
  const { data, error } = await supabase.functions.invoke("export-account", {
    method: "POST",
    body: {
      analytics_consent: options.analyticsConsent
        ? {
            cookies_accepted: options.analyticsConsent.cookiesAccepted,
            source: options.analyticsConsent.source ?? "device",
          }
        : undefined,
    },
  });

  if (error) {
    return { error: error.message ?? "Export request failed" };
  }

  const body = data as {
    ok?: boolean;
    url?: string;
    expires_at?: string;
    expires_in_seconds?: number;
    error?: string;
    retry_after_hours?: number;
  } | null;

  if (body?.error) {
    return {
      error: body.error,
      retryAfterHours: body.retry_after_hours,
    };
  }

  if (body?.ok && body.url && body.expires_at && body.expires_in_seconds) {
    return {
      ok: true,
      url: body.url,
      expiresAt: body.expires_at,
      expiresInSeconds: body.expires_in_seconds,
    };
  }

  return { error: "Unexpected response" };
}

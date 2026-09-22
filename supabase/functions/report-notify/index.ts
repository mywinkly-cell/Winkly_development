/**
 * report-notify — server-side fan-out of user/message reports to a moderation inbox.
 *
 * DSA notice-and-action (LEG-3): every report a user files must reach a real
 * inbox. Postgres AFTER INSERT triggers on `user_reports` / `message_reports`
 * call this function over pg_net the moment the row is committed. It delivers
 * a plain-text summary two ways (either can be enabled independently):
 *   1. SMTP email to the moderation mailbox (SMTP_* env vars) — the primary
 *      path, since customer-care@mywinkly.de is a real mailbox at united-domains.
 *   2. An incoming webhook (REPORT_WEBHOOK_URL) — Slack / Discord / relay.
 * Reports are always persisted in the table regardless — this is only the
 * notification layer on top. If neither is configured, the call is accepted
 * and logged only.
 *
 * Auth: not user-facing. Protected by the shared `x-webhook-secret` header that
 *   must equal WEBHOOK_SECRET (the same secret notify-fanout uses; verify_jwt is
 *   disabled for this function — see supabase/config.toml).
 *
 * Env:
 *   WEBHOOK_SECRET        required — shared secret with the DB triggers.
 *   SMTP_HOST             optional — e.g. smtps.udag.de (united-domains).
 *   SMTP_PORT             optional — default 587 (STARTTLS). Use 465 with SMTP_TLS=true.
 *   SMTP_TLS              optional — "true" for implicit TLS (port 465), default STARTTLS.
 *   SMTP_USER             optional — mailbox login (e.g. customer-care@mywinkly.de).
 *   SMTP_PASS             optional — mailbox password / app password.
 *   REPORT_EMAIL_TO       optional — recipient, default customer-care@mywinkly.de.
 *   REPORT_EMAIL_FROM     optional — default SMTP_USER.
 *   REPORT_WEBHOOK_URL    optional — incoming webhook to POST to.
 *   REPORT_WEBHOOK_FORMAT optional — "slack" (default) posts { text }, "raw"
 *                         posts { type, record, summary }.
 *
 * Body (from the DB triggers):
 *   { type: "user_report" | "message_report" | "media_review", record: { ... } }
 *   media_review = an image held in the moderation queue (media_moderation, see
 *   docs/MODERATION.md) — sent by the trg_media_moderation_queued trigger.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type ReportRecord = Record<string, unknown>;

function summarize(type: string, r: ReportRecord): string {
  const when = String(r.created_at ?? new Date().toISOString());
  if (type === "media_review") {
    const reasons = Array.isArray(r.reasons) ? (r.reasons as unknown[]).join(", ") : "?";
    return [
      r.failed_closed
        ? "🕒 Image held for review on Winkly (moderation vendor unavailable)"
        : "🕒 Image flagged for manual review on Winkly",
      `• media_moderation.id: ${r.id ?? "?"}`,
      `• kind: ${r.kind ?? "?"}`,
      `• uploader: ${r.user_id ?? "?"}`,
      `• reasons: ${reasons || "—"}`,
      `• at: ${when}`,
      "Review in Supabase Studio → media_moderation (see docs/MODERATION.md).",
    ].join("\n");
  }
  const lines =
    type === "message_report"
      ? [
          "🚩 New message report on Winkly",
          `• message_id: ${r.message_id ?? "?"}`,
          `• reporter_id: ${r.reporter_id ?? "?"}`,
          `• reason: ${r.reason ?? "?"}`,
          r.details ? `• details: ${r.details}` : null,
          `• at: ${when}`,
        ]
      : [
          "🚩 New profile report on Winkly",
          `• reported_id: ${r.reported_id ?? "?"}`,
          `• reporter_id: ${r.reporter_id ?? "?"}`,
          `• reason: ${r.reason ?? "?"}`,
          r.details ? `• details: ${r.details}` : null,
          `• at: ${when}`,
        ];
  return lines.filter(Boolean).join("\n");
}

/** Sends the report summary by SMTP when SMTP_HOST/SMTP_USER/SMTP_PASS are set. */
async function sendEmail(type: string, summary: string): Promise<{ attempted: boolean; ok: boolean; error?: string }> {
  const hostname = Deno.env.get("SMTP_HOST") ?? "";
  const username = Deno.env.get("SMTP_USER") ?? "";
  const password = Deno.env.get("SMTP_PASS") ?? "";
  if (!hostname || !username || !password) return { attempted: false, ok: false };

  const port = Number(Deno.env.get("SMTP_PORT") ?? "587");
  const tls = (Deno.env.get("SMTP_TLS") ?? "false").toLowerCase() === "true";
  const to = Deno.env.get("REPORT_EMAIL_TO") || "customer-care@mywinkly.de";
  const from = Deno.env.get("REPORT_EMAIL_FROM") || username;

  const client = new SMTPClient({
    connection: { hostname, port, tls, auth: { username, password } },
  });

  try {
    await client.send({
      from,
      to,
      subject:
        type === "message_report"
          ? "🚩 New message report — Winkly"
          : type === "media_review"
            ? "🕒 Image awaiting moderation review — Winkly"
            : "🚩 New profile report — Winkly",
      content: summary,
    });
    return { attempted: true, ok: true };
  } catch (e) {
    console.error("report-notify: SMTP send failed", e);
    return { attempted: true, ok: false, error: "smtp send failed" };
  } finally {
    await client.close().catch(() => {});
  }
}

/** Forwards the report summary to REPORT_WEBHOOK_URL when set. */
async function sendWebhook(type: string, record: ReportRecord, summary: string): Promise<{ attempted: boolean; ok: boolean; status?: number }> {
  const target = Deno.env.get("REPORT_WEBHOOK_URL") ?? "";
  if (!target) return { attempted: false, ok: false };

  const format = (Deno.env.get("REPORT_WEBHOOK_FORMAT") ?? "slack").toLowerCase();
  const body =
    format === "raw"
      ? JSON.stringify({ type, record, summary })
      : JSON.stringify({ text: summary });

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) console.error("report-notify: webhook returned", res.status);
    return { attempted: true, ok: res.ok, status: res.status };
  } catch (e) {
    console.error("report-notify: forward failed", e);
    return { attempted: true, ok: false };
  }
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("WEBHOOK_SECRET") ?? "";
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!expected || provided !== expected) return json({ error: "Unauthorized" }, 401);

  let payload: { type?: string; record?: ReportRecord };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const type =
    payload.type === "message_report" || payload.type === "media_review" ? payload.type : "user_report";
  const record = payload.record ?? {};
  const summary = summarize(type, record);

  const [email, webhook] = await Promise.all([
    sendEmail(type, summary),
    sendWebhook(type, record, summary),
  ]);

  if (!email.attempted && !webhook.attempted) {
    // Neither channel configured yet — the report is already in the DB. Log
    // and succeed so the trigger does not retry.
    console.log("report-notify (no SMTP_* or REPORT_WEBHOOK_URL set):\n" + summary);
    return json({ ok: true, email, webhook });
  }

  const ok = (email.attempted ? email.ok : true) && (webhook.attempted ? webhook.ok : true);
  return json({ ok, email, webhook }, ok ? 200 : 502);
});

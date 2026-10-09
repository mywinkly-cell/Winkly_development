// Link-preview image (1200×630 PNG) for a shared plan — what WhatsApp, Telegram and iMessage show.
// buildOgTree() is pure (a satori element tree as plain objects, no JSX) and unit-tested;
// website/api/plan-og.mjs renders it with @vercel/og.
// Colors mirror the app's design tokens (violet scale) — the image is always the light brand card.

import { formatWhen } from "./render.mjs";
import { tr } from "./strings.mjs";

export const OG_SIZE = { width: 1200, height: 630 };

const TOKENS = {
  violet: "#5A189A",
  violetLight: "#7B2CBF",
  violetTint: "#F7F0FC",
  yellow: "#FFD60A",
  white: "#FFFFFF",
  ink: "#1C1330",
};

function el(type, style, children) {
  return { type, props: { style, children } };
}

function clamp(text, max) {
  const s = String(text ?? "").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** @param {{status: string, plan?: object}} result @param {string} lang */
export function buildOgTree(result, lang) {
  const plan = result?.status === "ok" || result?.status === "full" ? result.plan : null;

  const brand = el("div", { display: "flex", alignItems: "center", gap: 16 }, [
    el(
      "div",
      {
        width: 56,
        height: 56,
        borderRadius: 16,
        background: TOKENS.white,
        color: TOKENS.violet,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 32,
        fontWeight: 700,
      },
      "W",
    ),
    el("div", { color: TOKENS.white, fontSize: 36, fontWeight: 700 }, "Winkly"),
  ]);

  const frame = (children) =>
    el(
      "div",
      {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: `linear-gradient(135deg, ${TOKENS.violet} 0%, ${TOKENS.violetLight} 100%)`,
        fontFamily: "sans-serif",
      },
      children,
    );

  if (!plan) {
    return frame([brand, el("div", { color: TOKENS.white, fontSize: 56, fontWeight: 700, display: "flex" }, clamp(tr(lang, "tagline"), 70))]);
  }

  const host = plan.host?.first_name || null;
  const photo = typeof plan.host?.photo_url === "string" && plan.host.photo_url.startsWith("https://") ? plan.host.photo_url : null;
  const when = formatWhen(plan.starts_at, plan.time_zone, lang);
  const metaLine = [when, plan.neighbourhood].filter(Boolean).join(" · ");
  const lead = host ? tr(lang, "invitedBy", { host }) : tr(lang, "invitedAnon");

  const hostRow = el("div", { display: "flex", alignItems: "center", gap: 20 }, [
    photo
      ? { type: "img", props: { src: photo, width: 88, height: 88, style: { borderRadius: 44, objectFit: "cover", border: `4px solid ${TOKENS.white}` } } }
      : el(
          "div",
          {
            width: 88,
            height: 88,
            borderRadius: 44,
            background: TOKENS.violetTint,
            color: TOKENS.violet,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 44,
            fontWeight: 700,
          },
          (host ?? "W").slice(0, 1).toUpperCase(),
        ),
    el("div", { color: TOKENS.violetTint, fontSize: 36, display: "flex" }, clamp(lead, 48)),
  ]);

  const middle = el("div", { display: "flex", flexDirection: "column", gap: 20 }, [
    hostRow,
    el("div", { color: TOKENS.white, fontSize: 76, fontWeight: 700, lineHeight: 1.1, display: "flex" }, clamp(plan.title, 60)),
    metaLine ? el("div", { color: TOKENS.yellow, fontSize: 38, display: "flex" }, clamp(metaLine, 60)) : null,
  ].filter(Boolean));

  const cta = el("div", { display: "flex", justifyContent: "space-between", alignItems: "center" }, [
    brand,
    el(
      "div",
      {
        background: TOKENS.white,
        color: TOKENS.ink,
        borderRadius: 999,
        padding: "16px 36px",
        fontSize: 34,
        fontWeight: 700,
        display: "flex",
      },
      tr(lang, "imIn").replace(/\s*\p{Extended_Pictographic}/gu, "").trim(),
    ),
  ]);

  return frame([middle, cta]);
}

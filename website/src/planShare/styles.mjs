// Mirrors the design tokens in apps/mobile/constants/design-system (violet scale, neutrals,
// radii, spacing). Kept as a JS module so Vercel bundles it with the function.
export const PLAN_PAGE_STYLES = `
/* Shared-plan page (mywinkly.de/p/<token>) — Winkly design tokens, mirrors the app's PlanCard. */
:root {
  --violet: #5a189a;
  --violet-pressed: #47137a;
  --violet-tint: #f7f0fc;
  --text: #1c1330;
  --text-muted: #6b5f80;
  --bg: #faf8fc;
  --card: #ffffff;
  --border: #e1daec;
  --error: #e53935;
  --error-bg: #fdecea;
  --success-bg: #e8f8ef;
  --radius-lg: 20px;
  --radius-md: 14px;
  --radius-pill: 999px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --violet: #a466d6;
    --violet-pressed: #8a4fc0;
    --violet-tint: #2a2338;
    --text: #f3f0f8;
    --text-muted: #b3a6c9;
    --bg: #14101b;
    --card: #211b2c;
    --border: #362e44;
    --error: #ff6b67;
    --error-bg: #3b1210;
    --success-bg: #12301f;
  }
}

* { box-sizing: border-box; }

[hidden] { display: none !important; }

body.share-body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  color: var(--text);
  background: var(--bg);
}

a { color: var(--violet); }

.share-header {
  padding: var(--space-md);
  max-width: 560px;
  width: 100%;
  margin: 0 auto;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
  font-weight: 700;
  font-size: 1.125rem;
}

.brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--violet);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 0.875rem;
}

.share-main {
  flex: 1;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: 0 var(--space-md) var(--space-lg);
}

.plan-card {
  background: var(--card);
  border: 1px solid var(--border);
  border-left: 4px solid var(--violet);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  box-shadow: 0 8px 24px rgba(28, 19, 48, 0.08);
}

.plan-host {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: var(--space-md);
}

.plan-avatar {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-pill);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--violet-tint);
}

.plan-avatar--empty {
  display: grid;
  place-items: center;
  color: var(--violet);
  font-weight: 700;
}

.plan-lead, .plan-overline {
  margin: 0;
  color: var(--text-muted);
  font-weight: 600;
}

.plan-title {
  margin: 0 0 var(--space-sm);
  font-size: 1.75rem;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.plan-meta {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-md);
  color: var(--text-muted);
  display: grid;
  gap: var(--space-xs);
}

.plan-fit {
  margin: 0 0 var(--space-lg);
  padding: 12px var(--space-md);
  background: var(--violet-tint);
  border-radius: var(--radius-md);
}

.plan-muted { color: var(--text-muted); }

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 52px;
  padding: 12px var(--space-md);
  border-radius: var(--radius-md);
  font: inherit;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn-primary { background: var(--violet); color: #fff; font-size: 1.125rem; }
.btn-primary:hover { background: var(--violet-pressed); }
.btn-primary:disabled { opacity: 0.6; cursor: default; }
.btn-secondary { background: var(--card); color: var(--violet); border-color: var(--violet); }
.btn-ghost { background: transparent; color: var(--violet); }

.plan-actions {
  display: grid;
  gap: var(--space-sm);
  margin-top: var(--space-md);
}

.rsvp-form {
  display: grid;
  gap: 12px;
}

.rsvp-form label {
  display: grid;
  gap: var(--space-xs);
  font-weight: 600;
  font-size: 0.9375rem;
}

.rsvp-form input {
  font: inherit;
  min-height: 48px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
}

.rsvp-form input:focus { outline: 2px solid var(--violet); outline-offset: 1px; }

.rsvp-done {
  padding: var(--space-md);
  border-radius: var(--radius-md);
  background: var(--success-bg);
}

.rsvp-done h2 { margin: 0 0 var(--space-xs); font-size: 1.25rem; }
.rsvp-done p { margin: 0; }

.rsvp-error {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--error-bg);
  color: var(--error);
}

.plan-privacy {
  margin: var(--space-md) 0 0;
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.share-footer {
  text-align: center;
  padding: var(--space-lg) var(--space-md);
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.share-footer p { margin: var(--space-xs) 0; }
`;

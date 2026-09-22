// config/flags.ts
// Build-time feature flags. Keep flags here (not scattered) so launch state is auditable.

/**
 * Weekly Spark — sponsored placements.
 *
 * OFF at launch: 100% of Spark slots are organic and personalized. The data model and the
 * "Partner pick" disclosure rendering exist now (rails), but no sponsored plan may occupy a
 * slot while this is false. Even when enabled, a sponsored plan must pass the SAME relevance/
 * trust gate as an organic one — sponsorship buys eligibility, never a quality bypass.
 *
 * Mirror of the server-side `SPARK_SPONSORED_ENABLED` env read by weekly-spark-cron.
 */
export const SPARK_SPONSORED_ENABLED = false;

/**
 * Business MODE — private users' professional-networking mode (the 4th mode tile).
 *
 * OFF for the closed beta: Romance, Friends and Events are live; Business shows a "Coming soon"
 * tile that captures waitlist interest (app_feedback, screen = "business_waitlist") and cannot be
 * enabled or entered. All Business mode code/routes stay in place, guarded — never read this
 * directly in UI; go through `isModeAvailable()` in lib/modes/availability.
 */
export const BUSINESS_MODE_ENABLED = false;

/**
 * Business ACCOUNT type — venues/companies with offers, analytics and ticketing.
 *
 * OFF for the closed beta: sign-up can't create one and existing business accounts land on a
 * "coming soon" screen (their data is untouched). Read via `isAccountTypeAvailable()`.
 */
export const BUSINESS_ACCOUNTS_ENABLED = false;

/**
 * Plan-it bar — one line of text (or one chip tap) → plan options, with the AI's assumptions
 * shown as editable chips. The default planning entry on the Planner tab and the Romance /
 * Friends / Events homes; the full step-by-step wizard stays reachable from the bar.
 *
 * Kill switch: false restores the previous entry points (Planner header / promo card → wizard).
 */
export const PLAN_IT_ENTRY_ENABLED = true;

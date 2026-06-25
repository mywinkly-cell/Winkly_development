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

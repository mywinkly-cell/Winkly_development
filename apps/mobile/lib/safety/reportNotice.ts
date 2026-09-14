// apps/mobile/lib/safety/reportNotice.ts
// DSA notice-and-action (LEG-3): once a user has filed a report, tell them what
// happens next and give them a real inbox to reach moderation. Copy is
// condensed from docs/PRIVACY_AND_DSA_DRAFTS.md §3.

import { Alert, Linking } from "react-native";

/** Staffed inbox already configured in the app — see app/account/legal.tsx. */
export const MODERATION_CONTACT_EMAIL = "customer-care@mywinkly.de";

export const REPORT_NOTICE_TITLE = "Report received";

/** Short notice-and-action text shown after a report is recorded. */
export const REPORT_NOTICE_BODY =
  "Thanks — this report has gone to Winkly's moderation team. We review every " +
  "report and may remove content, limit or suspend an account, or decide no " +
  "action is needed. Anyone we act against is told what we did, why, and how " +
  "to appeal.\n\nFor an urgent safety issue you can also email us.";

export function openModerationEmail(subject = "Content report") {
  const url = `mailto:${MODERATION_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  Linking.openURL(url).catch(() => {});
}

/**
 * Confirmation shown after a report has been persisted. States the
 * notice-and-action process and offers the moderation inbox as a second channel.
 */
export function showReportReceivedNotice(subject = "Content report") {
  Alert.alert(REPORT_NOTICE_TITLE, REPORT_NOTICE_BODY, [
    { text: `Email ${MODERATION_CONTACT_EMAIL}`, onPress: () => openModerationEmail(subject) },
    { text: "Done", style: "cancel" },
  ]);
}

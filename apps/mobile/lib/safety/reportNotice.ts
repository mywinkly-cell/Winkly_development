// apps/mobile/lib/safety/reportNotice.ts
// DSA notice-and-action (LEG-3): once a user has filed a report, tell them what
// happens next and give them a real inbox to reach moderation. Copy is
// condensed from docs/PRIVACY_AND_DSA_DRAFTS.md §3.

import { Alert, Linking } from "react-native";
import { t } from "i18next";

/** Staffed inbox already configured in the app — see app/account/legal.tsx. */
export const MODERATION_CONTACT_EMAIL = "customer-care@mywinkly.de";

/** i18n keys for the notice-and-action text shown after a report is recorded. */
export const REPORT_NOTICE_TITLE_KEY = "alerts.report.receivedTitle";
export const REPORT_NOTICE_BODY_KEY = "alerts.report.receivedBody";

export function openModerationEmail(subject = "Content report") {
  const url = `mailto:${MODERATION_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  Linking.openURL(url).catch(() => {});
}

/**
 * Confirmation shown after a report has been persisted. States the
 * notice-and-action process and offers the moderation inbox as a second channel.
 */
export function showReportReceivedNotice(subject = "Content report") {
  Alert.alert(t(REPORT_NOTICE_TITLE_KEY), t(REPORT_NOTICE_BODY_KEY), [
    { text: t("alerts.report.emailUs", { email: MODERATION_CONTACT_EMAIL }), onPress: () => openModerationEmail(subject) },
    { text: t("common.done"), style: "cancel" },
  ]);
}

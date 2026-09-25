// apps/mobile/lib/safety/reportNotice.ts
// DSA notice-and-action (LEG-3): once a user has filed a report, tell them what
// happens next and give them a real inbox to reach moderation. Copy is
// condensed from docs/PRIVACY_AND_DSA_DRAFTS.md §3.

import { Alert, Linking } from "react-native";
import i18n from "i18next";

/** Staffed inbox already configured in the app — see app/account/legal.tsx. */
export const MODERATION_CONTACT_EMAIL = "customer-care@mywinkly.de";


export function openModerationEmail(subject = "Content report") {
  const url = `mailto:${MODERATION_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  Linking.openURL(url).catch(() => {});
}

/**
 * Confirmation shown after a report has been persisted. States the
 * notice-and-action process and offers the moderation inbox as a second channel.
 * `subject` is the email subject for the moderation team and stays in English.
 */
export function showReportReceivedNotice(subject = "Content report") {
  Alert.alert(i18n.t("moderation.reportReceived.title"), i18n.t("moderation.reportReceived.body"), [
    {
      text: i18n.t("moderation.reportReceived.email", { email: MODERATION_CONTACT_EMAIL }),
      onPress: () => openModerationEmail(subject),
    },
    { text: i18n.t("common.done"), style: "cancel" },
  ]);
}

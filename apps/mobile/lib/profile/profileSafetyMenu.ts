import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { t } from "i18next";
import { blockUser, reportUser } from "@/lib/matching/actions";
import { showReportReceivedNotice } from "@/lib/safety/reportNotice";

/** `value` is what we store (stays English for moderators); `labelKey` is what the user sees. */
const BLOCK_REASONS = [
  { value: "Not what I'm looking for", labelKey: "alerts.safety.blockReason.notLookingFor" },
  { value: "Card is repeating", labelKey: "alerts.safety.blockReason.repeating" },
  { value: "Other", labelKey: "alerts.safety.reason.other" },
] as const;

const REPORT_REASONS = [
  { value: "Inappropriate content", code: "inappropriate", labelKey: "alerts.safety.reportReason.inappropriate" },
  { value: "Fake profile", code: "fake_profile", labelKey: "alerts.safety.reportReason.fakeProfile" },
  { value: "Harassment", code: "harassment", labelKey: "alerts.safety.reportReason.harassment" },
  { value: "Spam", code: "spam", labelKey: "alerts.safety.reportReason.spam" },
  { value: "Other", code: "other", labelKey: "alerts.safety.reason.other" },
] as const;

export function showProfileBlockReportMenu(targetUserId: string, onDone?: () => void) {
  Haptics.selectionAsync();
  Alert.alert(t("alerts.safety.menuTitle"), t("alerts.safety.menuMessage"), [
    { text: t("common.cancel"), style: "cancel" },
    {
      text: t("alerts.safety.block"),
      onPress: () => {
        Alert.alert(t("alerts.safety.blockWhyTitle"), t("alerts.safety.blockWhyMessage"), [
          { text: t("common.cancel"), style: "cancel" },
          ...BLOCK_REASONS.map((reason) => ({
            text: t(reason.labelKey),
            onPress: async () => {
              try {
                await blockUser({ targetUserId, reason: reason.value });
                onDone?.();
              } catch {
                Alert.alert(t("common.error"), t("alerts.safety.blockFailed"));
              }
            },
          })),
        ]);
      },
    },
    {
      text: t("moderation.report"),
      style: "destructive",
      onPress: () => {
        Alert.alert(t("alerts.safety.reportWhyTitle"), t("alerts.safety.reportWhyMessage"), [
          { text: t("common.cancel"), style: "cancel" },
          ...REPORT_REASONS.map((reason) => ({
            text: t(reason.labelKey),
            onPress: async () => {
              try {
                await reportUser({ targetUserId, reason: reason.code });
                await blockUser({ targetUserId, reason: "Reported: " + reason.value });
                onDone?.();
                showReportReceivedNotice("Report: profile");
              } catch {
                Alert.alert(t("common.error"), t("alerts.safety.reportFailed"));
              }
            },
          })),
        ]);
      },
    },
  ]);
}

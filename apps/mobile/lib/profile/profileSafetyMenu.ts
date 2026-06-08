import { Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { blockUser, reportUser } from "@/lib/matching/actions";

const BLOCK_REASONS = ["Not what I'm looking for", "Card is repeating", "Other"] as const;
const REPORT_REASONS = ["Inappropriate content", "Fake profile", "Harassment", "Spam", "Other"] as const;

function mapReportReason(reason: (typeof REPORT_REASONS)[number]) {
  if (reason === "Inappropriate content") return "inappropriate" as const;
  if (reason === "Fake profile") return "fake_profile" as const;
  if (reason === "Harassment") return "harassment" as const;
  if (reason === "Spam") return "spam" as const;
  return "other" as const;
}

export function showProfileBlockReportMenu(targetUserId: string, onDone?: () => void) {
  Haptics.selectionAsync();
  Alert.alert("Block or report", "Choose an action for this profile.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Block",
      onPress: () => {
        Alert.alert("Why do you want to block?", "This profile will be removed from your suggestions.", [
          { text: "Cancel", style: "cancel" },
          ...BLOCK_REASONS.map((reason) => ({
            text: reason,
            onPress: async () => {
              try {
                await blockUser({ targetUserId, reason });
                onDone?.();
              } catch {
                Alert.alert("Error", "Could not block. Please try again.");
              }
            },
          })),
        ]);
      },
    },
    {
      text: "Report",
      style: "destructive",
      onPress: () => {
        Alert.alert("Why are you reporting?", "Winkly admins will be notified.", [
          { text: "Cancel", style: "cancel" },
          ...REPORT_REASONS.map((reason) => ({
            text: reason,
            onPress: async () => {
              try {
                await reportUser({ targetUserId, reason: mapReportReason(reason) });
                await blockUser({ targetUserId, reason: "Reported: " + reason });
                onDone?.();
                Alert.alert("Report sent", "Thanks for helping keep Winkly safe.");
              } catch {
                Alert.alert("Error", "Could not report. Please try again.");
              }
            },
          })),
        ]);
      },
    },
  ]);
}

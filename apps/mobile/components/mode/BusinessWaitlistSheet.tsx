// BusinessWaitlistSheet — shown when a user taps the "Coming soon" Business tile.
// Captures what they'd want from Business networking into app_feedback (one row per user).

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/constants/design-system";
import { Chip, Input, PrimaryButton, TextButton } from "@/components/ds";
import { hasJoinedBusinessWaitlist, joinBusinessWaitlist } from "@/lib/feedback/businessWaitlist";
import {
  BUSINESS_WAITLIST_INTERESTS,
  BUSINESS_WAITLIST_TEXT_MAX,
  type BusinessWaitlistInterest,
} from "@/lib/modes/businessWaitlist";

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Phase = "checking" | "form" | "joined" | "alreadyJoined";

const INTEREST_LABEL_KEY: Record<BusinessWaitlistInterest, string> = {
  experts_collaborators: "businessWaitlist.interest.experts",
  clients: "businessWaitlist.interest.clients",
  promote_venue: "businessWaitlist.interest.promote",
  something_else: "businessWaitlist.interest.other",
};

export function BusinessWaitlistSheet({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [interests, setInterests] = useState<BusinessWaitlistInterest[]>([]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      sheetRef.current?.dismiss();
      return;
    }
    sheetRef.current?.present();
    let cancelled = false;
    void hasJoinedBusinessWaitlist().then((joined) => {
      if (cancelled) return;
      // A row saved this session always wins, even if the read-back races the insert.
      setPhase((p) => (p === "joined" || p === "alreadyJoined" || joined ? "alreadyJoined" : "form"));
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.35} />
    ),
    []
  );

  const toggleInterest = (interest: BusinessWaitlistInterest) => {
    setInterests((prev) => (prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]));
  };

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const ok = await joinBusinessWaitlist(interests, text);
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPhase("joined");
      } else {
        setError(t("businessWaitlist.error"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const titleStyle = [theme.type.h2, { color: theme.colors.textPrimary, fontFamily: theme.type.h2.fontFamily }];
  const bodyStyle = [
    theme.type.body,
    { color: theme.colors.textSecondary, fontFamily: theme.type.body.fontFamily, marginTop: theme.spacing.sm },
  ];

  return (
    <BottomSheetModal
      ref={sheetRef}
      enablePanDownToClose
      onDismiss={() => {
        setError(null);
        onClose();
      }}
      backdropComponent={renderBackdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl }}
      handleIndicatorStyle={{ backgroundColor: theme.colors.borderStrong }}
    >
      <BottomSheetView
        testID="business-waitlist-sheet"
        style={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.xxxl }}
      >
        {phase === "checking" ? (
          <View style={{ paddingVertical: theme.spacing.huge, alignItems: "center" }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : phase === "form" ? (
          <>
            <Text style={titleStyle} accessibilityRole="header">
              {t("businessWaitlist.title")}
            </Text>
            <Text style={bodyStyle}>{t("businessWaitlist.body")}</Text>

            <View
              style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginVertical: theme.spacing.lg }}
            >
              {BUSINESS_WAITLIST_INTERESTS.map((interest) => (
                <Chip
                  key={interest}
                  label={t(INTEREST_LABEL_KEY[interest])}
                  selected={interests.includes(interest)}
                  onPress={() => toggleInterest(interest)}
                  mode="business"
                />
              ))}
            </View>

            <Input
              testID="business-waitlist-input"
              label={t("businessWaitlist.inputLabel")}
              value={text}
              onChangeText={setText}
              maxLength={BUSINESS_WAITLIST_TEXT_MAX}
              returnKeyType="done"
              error={error ?? undefined}
            />

            <PrimaryButton
              title={t("businessWaitlist.submit")}
              onPress={() => void onSubmit()}
              loading={submitting}
              disabled={submitting}
            />
          </>
        ) : (
          <>
            <Text style={titleStyle} accessibilityRole="header">
              {phase === "joined" ? t("businessWaitlist.joinedTitle") : t("businessWaitlist.alreadyJoined")}
            </Text>
            <Text style={bodyStyle}>{t("businessWaitlist.joinedBody")}</Text>
            <TextButton
              title={t("common.close")}
              onPress={() => sheetRef.current?.dismiss()}
              style={{ marginTop: theme.spacing.lg }}
            />
          </>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

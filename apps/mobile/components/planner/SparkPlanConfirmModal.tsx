/**
 * Confirm a pre-built Weekly Spark / weekend-ideas plan — add to planner or invite,
 * without restarting the full concierge planning wizard.
 *
 * Invite sources are cross-mode: a Romance (Date) Spark can invite a friend or business
 * contact; the user can change the chat/planner mode on confirm. Relationship labels
 * (couple / family / …) are a future enhancement — for now mode = who you invite with.
 */

import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";
import { formatDayDate } from "@/lib/i18n/format";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "@/lib/useSafeAreaInsets";
import { ConciergeConfirmStep } from "@/components/ai/ConciergeConfirmStep";
import { ConciergeInviteStep, type InviteSourceChoice } from "@/components/ai/ConciergeInviteStep";
import { Avatar } from "@/components/ui/Avatar";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import { Colors, Typography } from "@/constants/tokens";
import {
  sparkPlanToStructured,
  modeForSparkSlot,
  dateForSparkPlan,
} from "@/lib/ai/weekendIdeasPlans";
import {
  getPartnersForConcierge,
  searchWinklyUsersForInvite,
  type ConciergePartner,
} from "@/lib/ai/conciergePartners";
import { sparkVenueFullAddressLine, type WeeklySparkPlan } from "@/lib/ai/weeklySpark";
import type { Mode } from "@/types";

export type SparkPlanConfirmModalProps = {
  visible: boolean;
  plan: WeeklySparkPlan | null;
  locationLineDisplay?: string;
  /** Open on invite picker (e.g. solo card secondary CTA / date invite CTA). */
  initialStep?: "confirm" | "invite";
  /** Called once the plan is added to the Planner (or invited), so the caller can mark its card "Planned". */
  onPlanAdded?: (sparkPlanId: string, plannerItemId: string) => void;
  onClose: () => void;
};

type SocialMode = "romance" | "friends" | "business";
type PickerChoice = "matches" | "friends" | "business" | "contacts";

const INVITE_MODE_OPTIONS: SocialMode[] = ["romance", "friends", "business"];

function modeForInviteSource(choice: PickerChoice): SocialMode {
  if (choice === "matches") return "romance";
  if (choice === "business") return "business";
  return "friends"; // friends + contacts default to friends (user can change on confirm)
}

function pickerTitleKey(choice: PickerChoice | null): string {
  if (choice === "matches") return "concierge.picker.match";
  if (choice === "friends") return "concierge.picker.friend";
  if (choice === "business") return "concierge.picker.business";
  return "concierge.picker.contact";
}

function timeHmFromIso(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function SparkPlanConfirmModal({
  visible,
  plan,
  locationLineDisplay,
  initialStep = "confirm",
  onPlanAdded,
  onClose,
}: SparkPlanConfirmModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"confirm" | "invite">(initialStep);
  const [partner, setPartner] = useState<{ id: string; displayName: string } | null>(null);
  const [inviteMode, setInviteMode] = useState<SocialMode | null>(null);
  const [pickerChoice, setPickerChoice] = useState<PickerChoice | null>(null);
  const [partners, setPartners] = useState<ConciergePartner[]>([]);
  const [contactsQuery, setContactsQuery] = useState("");
  const [contactsResults, setContactsResults] = useState<ConciergePartner[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep(initialStep);
    setPartner(null);
    setInviteMode(null);
    setPickerChoice(null);
    setContactsQuery("");
    setContactsResults([]);
  }, [visible, plan?.id, initialStep]);

  useEffect(() => {
    if (!pickerChoice || pickerChoice === "contacts") return;
    const mode = modeForInviteSource(pickerChoice);
    let cancelled = false;
    setPartners([]);
    void getPartnersForConcierge(mode).then((list) => {
      if (!cancelled) setPartners(list);
    });
    return () => {
      cancelled = true;
    };
  }, [pickerChoice]);

  useEffect(() => {
    if (pickerChoice !== "contacts") return;
    let cancelled = false;
    const run = async () => {
      setContactsLoading(true);
      const res = await searchWinklyUsersForInvite(contactsQuery, 40);
      if (!cancelled) setContactsResults(res);
      if (!cancelled) setContactsLoading(false);
    };
    const t = setTimeout(run, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [pickerChoice, contactsQuery]);

  if (!plan) return null;

  const slotMode = modeForSparkSlot(plan.slot);
  // Invite mode follows who you pick (and Send-as chips); otherwise keep the Spark slot mode
  // (solo → events, date → romance, meetup → friends).
  const confirmMode: Mode = inviteMode ?? slotMode;
  const dateForPlan = dateForSparkPlan(plan);
  const structured = sparkPlanToStructured(plan);

  const selectPartner = (p: ConciergePartner, mode: SocialMode) => {
    Haptics.selectionAsync();
    setPartner({ id: p.id, displayName: p.displayName });
    setInviteMode(mode);
    setPickerChoice(null);
    setContactsQuery("");
    setStep("confirm");
  };

  const openInviteStep = () => {
    Haptics.selectionAsync();
    setStep("invite");
  };

  const handleClose = () => {
    setStep("confirm");
    setPartner(null);
    setInviteMode(null);
    setPickerChoice(null);
    onClose();
  };

  const onInviteSelect = (choice: InviteSourceChoice) => {
    if (choice === "skip" || choice === "share_external") {
      setStep("confirm");
      return;
    }
    setPickerChoice(choice);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.sheet, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
        {step === "invite" ? (
          <ConciergeInviteStep
            mode={slotMode}
            planTitle={plan.title}
            planLocation={
              sparkVenueFullAddressLine({
                placeName: plan.placeName,
                placeAddress: plan.placeAddress,
              }) ||
              locationLineDisplay ||
              undefined
            }
            planDate={formatDayDate(dateForPlan)}
            onSelect={onInviteSelect}
            onBack={() => setStep("confirm")}
            showInlineBack
          />
        ) : (
          <ConciergeConfirmStep
            structuredPlan={structured}
            partner={partner}
            dateForPlan={dateForPlan}
            exactTimeHm={timeHmFromIso(plan.startsAt)}
            locationLineDisplay={locationLineDisplay}
            mode={confirmMode}
            onDone={handleClose}
            onBack={handleClose}
            onInviteSomeone={partner ? undefined : openInviteStep}
            onChangeInvitee={partner ? openInviteStep : undefined}
            inviteModeOptions={partner ? INVITE_MODE_OPTIONS : undefined}
            inviteMode={inviteMode ?? undefined}
            onInviteModeChange={
              partner
                ? (m) => {
                    setInviteMode(m);
                  }
                : undefined
            }
            allowEditDetails
            onReviewPlanner={handleClose}
            sparkPlanId={plan.id}
            onAddedToPlanner={(plannerItemId) => onPlanAdded?.(plan.id, plannerItemId)}
            showInlineBack
          />
        )}

        <Modal visible={pickerChoice != null} transparent animationType="slide">
          <Pressable style={styles.pickerBackdrop} onPress={() => setPickerChoice(null)}>
            <Pressable
              style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>{t(pickerTitleKey(pickerChoice))}</Text>
                <TouchableOpacity onPress={() => setPickerChoice(null)} hitSlop={12}>
                  <Ionicons name="close" size={24} color={Colors.gray600} />
                </TouchableOpacity>
              </View>
              {pickerChoice === "contacts" ? (
                <View style={styles.pickerSearchRow}>
                  <Ionicons name="search-outline" size={18} color={Colors.gray500} />
                  <TextInput
                    style={styles.pickerSearchInput}
                    value={contactsQuery}
                    onChangeText={setContactsQuery}
                    placeholder={t("concierge.picker.searchPlaceholder")}
                    placeholderTextColor={Colors.gray500}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                </View>
              ) : null}
              <GestureScrollView style={styles.pickerScroll} contentContainerStyle={styles.pickerScrollContent}>
                {pickerChoice === "contacts" ? (
                  contactsLoading ? (
                    <Text style={styles.pickerEmpty}>{t("concierge.picker.searching")}</Text>
                  ) : contactsResults.length === 0 ? (
                    <Text style={styles.pickerEmpty}>{t("concierge.picker.noUsers")}</Text>
                  ) : (
                    contactsResults.map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        style={styles.pickerRow}
                        onPress={() => selectPartner(p, "friends")}
                        activeOpacity={0.8}
                      >
                        <Avatar uri={p.avatar_url} size={48} />
                        <Text style={styles.pickerRowName} numberOfLines={1}>{p.displayName}</Text>
                        <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
                      </TouchableOpacity>
                    ))
                  )
                ) : partners.length === 0 ? (
                  <Text style={styles.pickerEmpty}>{t("concierge.picker.noOne")}</Text>
                ) : (
                  partners.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.pickerRow}
                      onPress={() =>
                        selectPartner(p, modeForInviteSource(pickerChoice!))
                      }
                      activeOpacity={0.8}
                    >
                      <Avatar uri={p.avatar_url} size={48} />
                      <Text style={styles.pickerRowName} numberOfLines={1}>{p.displayName}</Text>
                      <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
                    </TouchableOpacity>
                  ))
                )}
              </GestureScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: "#fff" },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingTop: 16,
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  pickerTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, paddingRight: 8 },
  pickerSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.gray100,
  },
  pickerSearchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.textPrimary,
    padding: 0,
  },
  pickerScroll: { maxHeight: 360 },
  pickerScrollContent: { paddingHorizontal: 12, paddingBottom: 24 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  pickerRowName: { ...Typography.body, color: Colors.textPrimary, flex: 1, fontWeight: "600" },
  pickerEmpty: {
    ...Typography.body,
    color: Colors.gray600,
    textAlign: "center",
    paddingVertical: 32,
  },
});

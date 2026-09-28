// apps/mobile/app/plan/new.tsx
// "+ New plan" — put something in the Planner yourself, like in any calendar.
// Winkly AI stays one tap away ("Need ideas?") but never in the way when you already
// know what you're doing. Also opened pre-filled from the Events catalogue, a sponsored
// venue or the wishlist ("use this as an idea for a date / meetup / just me").

import React, { useMemo, useState } from "react";
import { View, Text, Pressable, Platform, Alert, Linking, StyleSheet } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen, Header, Input, Chip, PrimaryButton, TextButton, Card } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { VenuePhoto } from "@/components/ui/VenuePhoto";
import { EVENT_PLATFORM_LABELS, useOfferPriceLabel } from "@/components/ui/EventCard";
import { useModeContext } from "@/providers/ModeContextProvider";
import { formatAppDate, formatAppTime, useAppLocaleTag } from "@/lib/i18n/appLocale";
import { getCachedCatalogItem } from "@/lib/events/catalog";
import {
  nextFullHour,
  parseNewPlanParams,
  saveNewPlan,
  validateNewPlan,
  type PlanAudience,
} from "@/lib/planner/newPlan";

const AUDIENCES: { key: PlanAudience; labelKey: string; icon: React.ComponentProps<typeof Ionicons>["name"] }[] = [
  { key: "self", labelKey: "newPlan.forMe", icon: "person-outline" },
  { key: "romance", labelKey: "newPlan.forDate", icon: "heart-outline" },
  { key: "friends", labelKey: "newPlan.forMeetup", icon: "people-outline" },
  { key: "business", labelKey: "newPlan.forBusiness", icon: "briefcase-outline" },
];

type PickerTarget = "date" | "start" | "end" | null;

export default function NewPlanScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t } = useTranslation();
  const locale = useAppLocaleTag();
  const { context } = useModeContext();
  const rawParams = useLocalSearchParams<Record<string, string>>();
  const prefill = useMemo(() => parseNewPlanParams(rawParams), [rawParams]);
  const catalogItem = useMemo(
    () => (prefill.catalogId ? getCachedCatalogItem(prefill.catalogId) : null),
    [prefill.catalogId]
  );
  const priceLabel = useOfferPriceLabel();

  // Only offer audiences whose mode the user has switched on.
  const audiences = useMemo(
    () => AUDIENCES.filter((a) => a.key === "self" || context.permissions.includes(a.key)),
    [context.permissions]
  );
  const defaultAudience: PlanAudience =
    prefill.audience && audiences.some((a) => a.key === prefill.audience) ? prefill.audience : "self";

  const [initialStart] = useState(() => {
    const d = prefill.startsAt ? new Date(prefill.startsAt) : null;
    return d && d.getTime() > Date.now() ? d : nextFullHour();
  });

  const [title, setTitle] = useState(prefill.title ?? "");
  const [audience, setAudience] = useState<PlanAudience>(defaultAudience);
  const [start, setStart] = useState<Date>(initialStart);
  const [end, setEnd] = useState<Date | null>(() => {
    const d = prefill.endsAt ? new Date(prefill.endsAt) : null;
    return d && d.getTime() > initialStart.getTime() ? d : null;
  });
  const [location, setLocation] = useState(prefill.location ?? "");
  const [notes, setNotes] = useState(prefill.notes ?? "");
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [saving, setSaving] = useState(false);
  const [withPartner, setWithPartner] = useState(!!(prefill.partnerUserId && prefill.conversationId));

  const photoSource = useMemo(
    () => ({
      imageUrl: prefill.imageUrl ?? catalogItem?.imageUrl ?? null,
      placeId: prefill.placeId ?? null,
      name: prefill.placeId ? null : location.trim() || null,
    }),
    [prefill.imageUrl, prefill.placeId, catalogItem?.imageUrl, location]
  );
  const showPhoto = !!(photoSource.imageUrl || photoSource.placeId || prefill.source !== "manual");

  const onPickerChange = (_: unknown, picked?: Date) => {
    if (Platform.OS === "android") setPicker(null);
    if (!picked) return;
    if (picker === "date") {
      const next = new Date(start);
      next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      const shift = next.getTime() - start.getTime();
      setStart(next);
      if (end) setEnd(new Date(end.getTime() + shift));
    } else if (picker === "start") {
      const next = new Date(start);
      next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      setStart(next);
      if (end && end.getTime() <= next.getTime()) setEnd(new Date(next.getTime() + 2 * 3600 * 1000));
    } else if (picker === "end") {
      const next = new Date(start);
      next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      if (next.getTime() <= start.getTime()) next.setDate(next.getDate() + 1); // ends after midnight
      setEnd(next);
    }
  };

  const onSave = async () => {
    const err = validateNewPlan({ title, startsAt: start, endsAt: end });
    if (err) {
      Alert.alert(t("newPlan.checkTitle"), t(err));
      return;
    }
    setSaving(true);
    try {
      const meta: Record<string, unknown> = {
        origin: prefill.source ?? "manual",
        ...(photoSource.imageUrl ? { image_url: photoSource.imageUrl } : {}),
        ...(prefill.placeId ? { place_id: prefill.placeId } : {}),
        ...(prefill.wishlistId ? { wishlist_item_id: prefill.wishlistId } : {}),
        ...(prefill.sponsoredOfferId ? { sponsored_offer_id: prefill.sponsoredOfferId } : {}),
        ...(catalogItem
          ? {
              external_id: catalogItem.id,
              external_url: catalogItem.externalUrl ?? null,
              external_platform: catalogItem.externalPlatform ?? null,
              offers: catalogItem.offers ?? [],
              venue_name: catalogItem.venueName ?? null,
            }
          : {}),
      };
      const res = await saveNewPlan({
        title,
        audience,
        startsAt: start,
        endsAt: end,
        location,
        notes,
        meta,
        invite:
          withPartner && prefill.partnerUserId && prefill.conversationId
            ? { userId: prefill.partnerUserId, conversationId: prefill.conversationId }
            : null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const hub = context.active_mode ?? "events";
      router.replace(`/(modes)/${hub}/planner?focus_planner_item_id=${encodeURIComponent(res.plannerItemId)}`);
    } catch {
      Alert.alert(t("newPlan.saveFailedTitle"), t("newPlan.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const askWinkly = () => {
    Haptics.selectionAsync();
    const mode = audience === "self" ? "events" : audience;
    router.push({
      pathname: "/concierge",
      params: {
        source_screen: "planner",
        mode,
        ...(title.trim() ? { prefill_prompt: title.trim() } : {}),
        ...(withPartner && prefill.partnerUserId ? { partner_user_id: prefill.partnerUserId } : {}),
        ...(withPartner && prefill.partnerName ? { partner_display_name: prefill.partnerName } : {}),
      },
    });
  };

  const pickerValue = picker === "end" ? end ?? new Date(start.getTime() + 2 * 3600 * 1000) : start;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        title={t("newPlan.title")}
        onBack
        trailing={<TextButton title={t("common.save")} onPress={onSave} disabled={saving} />}
      />
      <Screen edges={["bottom", "left", "right"]}>
        {showPhoto ? (
          <VenuePhoto
            source={photoSource}
            style={[styles.photo, { borderRadius: theme.radii.lg }]}
            icon="location-outline"
            showAttribution
          />
        ) : null}

        <View style={{ height: theme.spacing.lg }} />
        <Input
          label={t("newPlan.whatLabel")}
          value={title}
          onChangeText={setTitle}
          placeholder={t("newPlan.whatPlaceholder")}
          maxLength={140}
          autoFocus={!prefill.title}
        />

        <Text style={[theme.type.caption, { color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }]}>
          {t("newPlan.forLabel")}
        </Text>
        <View style={styles.chipRow}>
          {audiences.map((a) => (
            <Chip
              key={a.key}
              label={t(a.labelKey)}
              selected={audience === a.key}
              onPress={() => setAudience(a.key)}
            />
          ))}
        </View>

        {prefill.partnerUserId && prefill.conversationId ? (
          <Card padding="md" style={{ marginBottom: theme.spacing.md }}>
            <View style={styles.rowBetween}>
              <Text style={[theme.type.body, { color: theme.colors.textPrimary, flex: 1 }]}>
                {withPartner
                  ? t("newPlan.inviteWith", { name: prefill.partnerName ?? t("newPlan.partnerFallback") })
                  : t("newPlan.inviteOff")}
              </Text>
              <TextButton
                title={withPartner ? t("newPlan.inviteRemove") : t("newPlan.inviteAdd")}
                onPress={() => setWithPartner((v) => !v)}
              />
            </View>
          </Card>
        ) : null}

        <Text style={[theme.type.caption, { color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }]}>
          {t("newPlan.whenLabel")}
        </Text>
        <View style={styles.whenRow}>
          <WhenButton icon="calendar-outline" label={formatAppDate(start, undefined, locale)} onPress={() => setPicker("date")} />
          <WhenButton icon="time-outline" label={formatAppTime(start, undefined, locale)} onPress={() => setPicker("start")} />
          <WhenButton
            icon="flag-outline"
            label={end ? t("newPlan.until", { time: formatAppTime(end, undefined, locale) }) : t("newPlan.addEnd")}
            onPress={() => setPicker("end")}
          />
          {end ? (
            <Pressable onPress={() => setEnd(null)} accessibilityRole="button" accessibilityLabel={t("newPlan.clearEnd")} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {picker ? (
          <View style={{ marginBottom: theme.spacing.md }}>
            {Platform.OS === "ios" ? (
              <View style={{ alignItems: "flex-end" }}>
                <TextButton title={t("common.done")} onPress={() => setPicker(null)} />
              </View>
            ) : null}
            <DateTimePicker
              value={pickerValue}
              mode={picker === "date" ? "date" : "time"}
              minimumDate={picker === "date" ? new Date() : undefined}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onPickerChange}
            />
          </View>
        ) : null}

        <Input
          label={t("newPlan.whereLabel")}
          value={location}
          onChangeText={setLocation}
          placeholder={t("newPlan.wherePlaceholder")}
          maxLength={200}
        />
        <Input
          label={t("newPlan.notesLabel")}
          value={notes}
          onChangeText={setNotes}
          placeholder={t("newPlan.notesPlaceholder")}
          multiline
          style={{ minHeight: 90, textAlignVertical: "top" }}
          maxLength={1000}
        />

        {catalogItem?.offers?.length ? (
          <Card padding="md" style={{ marginBottom: theme.spacing.md }}>
            <Text style={[theme.type.bodyMedium, { color: theme.colors.textPrimary, marginBottom: theme.spacing.xs }]}>
              {t("newPlan.tickets")}
            </Text>
            {catalogItem.offers.map((o) => (
              <Pressable
                key={o.platform}
                onPress={() => void Linking.openURL(o.url)}
                accessibilityRole="link"
                style={styles.offerRow}
              >
                <Text style={[theme.type.body, { color: theme.colors.primary, flex: 1 }]}>
                  {EVENT_PLATFORM_LABELS[o.platform]}
                </Text>
                <Text style={[theme.type.caption, { color: theme.colors.textSecondary }]}>
                  {priceLabel([o]) ?? t("catalog.seePrices")}
                </Text>
                <Ionicons name="open-outline" size={16} color={theme.colors.textMuted} />
              </Pressable>
            ))}
          </Card>
        ) : null}

        <PrimaryButton title={t("newPlan.save")} onPress={onSave} loading={saving} disabled={saving} />
        <Pressable onPress={askWinkly} style={styles.aiLink} accessibilityRole="button">
          <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
          <Text style={[theme.type.body, { color: theme.colors.primary }]}>{t("newPlan.askWinkly")}</Text>
        </Pressable>
      </Screen>
    </View>
  );
}

function WhenButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.backgroundMuted,
      }}
    >
      <Ionicons name={icon} size={16} color={theme.colors.textPrimary} />
      <Text style={[theme.type.caption, { color: theme.colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", height: 180, marginTop: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: 8 },
  whenRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 16 },
  offerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  aiLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16 },
});

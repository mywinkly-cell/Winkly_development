// apps/mobile/components/wishlist/WishlistForm.tsx
// Add / edit a saved place. Paste a link (Instagram reel, TikTok, Google Maps…) and we fill
// what the link tells us; the photo comes from the place itself once name + city are set.
// "Share with" decides who can see it (per mode) and lets Winkly AI suggest it when you
// plan with them.

import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { Input, Chip } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { VenuePhoto } from "@/components/ui/VenuePhoto";
import { parseSharedLink } from "@/lib/wishlist/sharedLink";
import { SHAREABLE_MODES, type ShareableMode } from "@/lib/wishlistStore";

export type WishlistFormValues = {
  title: string;
  sourceUrl: string;
  address: string;
  city: string;
  description: string;
  price: string;
  sharedModes: ShareableMode[];
  latitude?: number;
  longitude?: number;
  placeId?: string;
  imageUrl?: string;
};

export const EMPTY_WISHLIST_FORM: WishlistFormValues = {
  title: "",
  sourceUrl: "",
  address: "",
  city: "",
  description: "",
  price: "",
  sharedModes: [],
};

export const SHARE_MODE_LABEL_KEYS: Record<ShareableMode, string> = {
  romance: "wishlist.shareDates",
  friends: "wishlist.shareFriends",
  business: "wishlist.shareBusiness",
};

type Props = {
  values: WishlistFormValues;
  onChange: (next: WishlistFormValues) => void;
  /** Modes the user has switched on — only those can be shared in. */
  availableModes: readonly string[];
  titleError?: string;
};

export function WishlistForm({ values, onChange, availableModes, titleError }: Props) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const [linkHint, setLinkHint] = useState<string | null>(null);
  const set = (patch: Partial<WishlistFormValues>) => onChange({ ...values, ...patch });

  const onLinkChange = (text: string) => {
    const parsed = parseSharedLink(text);
    if (!parsed) {
      set({ sourceUrl: text });
      setLinkHint(null);
      return;
    }
    set({
      sourceUrl: parsed.url,
      ...(parsed.title && !values.title.trim() ? { title: parsed.title } : {}),
      ...(typeof parsed.latitude === "number" ? { latitude: parsed.latitude, longitude: parsed.longitude } : {}),
    });
    setLinkHint(
      parsed.title
        ? t("wishlist.linkFilled")
        : parsed.source === "instagram" || parsed.source === "tiktok" || parsed.source === "youtube"
          ? t("wishlist.linkFromSocial")
          : null
    );
  };

  const shareable = useMemo(() => SHAREABLE_MODES.filter((m) => availableModes.includes(m)), [availableModes]);
  const toggleShare = (m: ShareableMode) =>
    set({
      sharedModes: values.sharedModes.includes(m)
        ? values.sharedModes.filter((x) => x !== m)
        : [...values.sharedModes, m],
    });

  const hasPhotoSource = !!(values.imageUrl || values.placeId || values.title.trim());

  return (
    <View>
      {hasPhotoSource ? (
        <VenuePhoto
          source={{
            imageUrl: values.imageUrl,
            placeId: values.placeId,
            name: values.title.trim() || null,
            city: values.city.trim() || null,
            latitude: values.latitude,
            longitude: values.longitude,
          }}
          style={[styles.photo, { borderRadius: theme.radii.lg }]}
          icon="bookmark-outline"
          showAttribution
        />
      ) : null}

      <Input
        label={t("wishlist.linkLabel")}
        value={values.sourceUrl}
        onChangeText={onLinkChange}
        placeholder={t("wishlist.linkPlaceholder")}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        helperText={linkHint ?? undefined}
      />
      <Input
        label={t("wishlist.nameLabel")}
        value={values.title}
        onChangeText={(v) => set({ title: v })}
        placeholder={t("wishlist.namePlaceholder")}
        maxLength={120}
        error={titleError}
      />
      <Input
        label={t("wishlist.addressLabel")}
        value={values.address}
        onChangeText={(v) => set({ address: v })}
        placeholder={t("wishlist.addressPlaceholder")}
        maxLength={180}
      />
      <Input
        label={t("wishlist.cityLabel")}
        value={values.city}
        onChangeText={(v) => set({ city: v })}
        placeholder={t("wishlist.cityPlaceholder")}
        maxLength={80}
      />
      <Input
        label={t("wishlist.notesLabel")}
        value={values.description}
        onChangeText={(v) => set({ description: v })}
        placeholder={t("wishlist.notesPlaceholder")}
        multiline
        style={{ minHeight: 80, textAlignVertical: "top" }}
        maxLength={500}
      />
      <Input
        label={t("wishlist.priceLabel")}
        value={values.price}
        onChangeText={(v) => set({ price: v })}
        placeholder={t("wishlist.pricePlaceholder")}
        maxLength={40}
      />

      {shareable.length > 0 ? (
        <View style={{ marginTop: theme.spacing.sm }}>
          <Text style={[theme.type.caption, { color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }]}>
            {t("wishlist.shareLabel")}
          </Text>
          <View style={styles.chips}>
            {shareable.map((m) => (
              <Chip
                key={m}
                label={t(SHARE_MODE_LABEL_KEYS[m])}
                selected={values.sharedModes.includes(m)}
                onPress={() => toggleShare(m)}
              />
            ))}
          </View>
          <Text style={[theme.type.caption, { color: theme.colors.textMuted, marginTop: theme.spacing.xs }]}>
            {values.sharedModes.length ? t("wishlist.shareHintOn") : t("wishlist.shareHintOff")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", height: 170, marginBottom: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});

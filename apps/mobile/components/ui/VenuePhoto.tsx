// apps/mobile/components/ui/VenuePhoto.tsx
// A picture of a venue / event / saved place, so a plan can be judged at a glance.
// Source priority lives in lib/places/placePhoto.ts. Falls back to a calm placeholder
// (icon on a tinted background) when there is no photo or it fails to load.

import React, { useEffect, useMemo, useState } from "react";
import { Image, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/providers/AuthProvider";
import { useAppTheme } from "@/constants/design-system";
import {
  isPlacePhotoEndpoint,
  placePhotoUrl,
  safeImageUrl,
  type PlacePhotoSource,
} from "@/lib/places/placePhoto";

type Props = {
  source: PlacePhotoSource | null | undefined;
  /** Gallery position (0 = main photo). */
  index?: number;
  width?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  /** Icon for the placeholder. */
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  /** Show the photographer credit (hero images). Thumbnails show a short "Google" credit. */
  showAttribution?: boolean;
  accessibilityLabel?: string;
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? null;

export function VenuePhoto({
  source,
  index = 0,
  width = 800,
  style,
  imageStyle,
  icon = "image-outline",
  showAttribution = false,
  accessibilityLabel,
}: Props) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  // Keyed by URL so a new source gets a fresh try without resetting state in an effect.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [credit, setCredit] = useState<string | null>(null);

  const uri = useMemo(() => (source ? placePhotoUrl(SUPABASE_URL, source, { index, width }) : null), [source, index, width]);
  const fromGoogle = !!uri && isPlacePhotoEndpoint(uri);

  const failed = !!uri && failedUri === uri;

  useEffect(() => {
    if (!showAttribution || !fromGoogle || !uri || !token) return;
    let cancelled = false;
    const jsonUrl = `${uri}&format=json`;
    fetch(jsonUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { attributions?: (string | null)[] } | null) => {
        if (cancelled) return;
        const i = Math.max(0, index - (safeImageUrl(source?.imageUrl) ? 1 : 0));
        setCredit(d?.attributions?.[i] ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showAttribution, fromGoogle, uri, token, index, source?.imageUrl]);

  const placeholder = (
    <View
      style={[
        { backgroundColor: theme.colors.backgroundMuted, alignItems: "center", justifyContent: "center", overflow: "hidden" },
        style,
      ]}
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={28} color={theme.colors.textMuted} />
    </View>
  );

  if (!uri || failed || (fromGoogle && !token)) return placeholder;

  return (
    <View style={[{ overflow: "hidden", backgroundColor: theme.colors.backgroundMuted }, style]}>
      <Image
        source={fromGoogle ? { uri, headers: { Authorization: `Bearer ${token}` } } : { uri }}
        style={[{ width: "100%", height: "100%" }, imageStyle]}
        resizeMode="cover"
        onError={() => setFailedUri(uri)}
        accessibilityLabel={accessibilityLabel}
        accessibilityIgnoresInvertColors
      />
      {fromGoogle ? (
        <View
          style={{
            position: "absolute",
            right: 4,
            bottom: 4,
            paddingHorizontal: 5,
            paddingVertical: 1,
            borderRadius: 4,
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 9 }} numberOfLines={1}>
            {credit ? t("venuePhoto.creditBy", { name: credit }) : t("venuePhoto.creditGoogle")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

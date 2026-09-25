/**
 * In-app map pin picker for planning location.
 * Uses react-native-maps (Google Maps on Android / when Maps API key is set; Apple Maps on iOS Expo Go).
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { PrimaryButton, SecondaryButton } from "@/components/ds";
import { reverseGeocodeToDisplay } from "@/lib/location/deviceLocation";
import { geocodeCityCountry } from "@/lib/weatherClient";

export type MapPinValue = {
  latitude: number;
  longitude: number;
  label?: string;
};

export type MapPinPickerModalProps = {
  visible: boolean;
  city?: string;
  country?: string;
  /** Optional existing pin. */
  initialPin?: MapPinValue | null;
  /** Optional search radius (km) drawn as a circle. */
  radiusKm?: number | null;
  language?: string;
  onConfirm: (pin: MapPinValue) => void;
  onClear?: () => void;
  onClose: () => void;
};

const DEFAULT_REGION: Region = {
  latitude: 48.137154,
  longitude: 11.576124,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function mapsProvider() {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const key =
    (typeof process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY === "string" &&
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.trim()) ||
    (typeof extra.googleMapsApiKey === "string" && extra.googleMapsApiKey.trim()) ||
    "";
  // Android defaults to Google; force Google on iOS only when a client Maps key is configured.
  if (Platform.OS === "android") return PROVIDER_GOOGLE;
  return key ? PROVIDER_GOOGLE : undefined;
}

export function MapPinPickerModal({
  visible,
  city,
  country,
  initialPin,
  radiusKm,
  language = "en",
  onConfirm,
  onClear,
  onClose,
}: MapPinPickerModalProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState<MapPinValue | null>(initialPin ?? null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [hint, setHint] = useState<string | null>(null);

  const provider = useMemo(() => mapsProvider(), []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setHint(null);
    setPin(initialPin ?? null);

    (async () => {
      setLoading(true);
      try {
        if (initialPin?.latitude != null && initialPin?.longitude != null) {
          if (!cancelled) {
            setRegion({
              latitude: initialPin.latitude,
              longitude: initialPin.longitude,
              latitudeDelta: radiusKm && radiusKm > 0 ? Math.max(0.04, radiusKm / 40) : 0.06,
              longitudeDelta: radiusKm && radiusKm > 0 ? Math.max(0.04, radiusKm / 40) : 0.06,
            });
          }
          return;
        }
        const cityName = city?.trim();
        if (cityName) {
          const coords = await geocodeCityCountry(cityName, country);
          if (!cancelled && coords) {
            setRegion({
              latitude: coords.lat,
              longitude: coords.lng,
              latitudeDelta: radiusKm && radiusKm > 0 ? Math.max(0.04, radiusKm / 40) : 0.08,
              longitudeDelta: radiusKm && radiusKm > 0 ? Math.max(0.04, radiusKm / 40) : 0.08,
            });
            setPin({ latitude: coords.lat, longitude: coords.lng, label: cityName });
            return;
          }
        }
        if (!cancelled) setRegion(DEFAULT_REGION);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, city, country, initialPin?.latitude, initialPin?.longitude, radiusKm]);

  const placePin = async (latitude: number, longitude: number) => {
    Haptics.selectionAsync();
    setPin({ latitude, longitude });
    setHint(t("concierge.map.resolving"));
    const geo = await reverseGeocodeToDisplay(latitude, longitude, language);
    if (geo.ok) {
      setPin({ latitude, longitude, label: geo.display });
      setHint(geo.display);
    } else {
      setHint(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel={t("concierge.map.close")}>
            <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.title}>{t("concierge.map.title")}</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.subtitle}>
          {city?.trim() ? t("concierge.map.tapNear", { city: city.trim() }) : t("concierge.map.tap")}
          {radiusKm ? ` ${t("concierge.map.radius", { km: radiusKm })}` : ""}
        </Text>

        <View style={styles.mapWrap}>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <MapView
              style={StyleSheet.absoluteFill}
              provider={provider}
              region={region}
              onRegionChangeComplete={setRegion}
              onPress={(e) => {
                const { latitude, longitude } = e.nativeEvent.coordinate;
                void placePin(latitude, longitude);
              }}
            >
              {pin ? (
                <Marker
                  coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
                  draggable
                  onDragEnd={(e) => {
                    const { latitude, longitude } = e.nativeEvent.coordinate;
                    void placePin(latitude, longitude);
                  }}
                  title={t("concierge.map.searchCenter")}
                  description={pin.label}
                />
              ) : null}
              {pin && radiusKm && radiusKm > 0 ? (
                <Circle
                  center={{ latitude: pin.latitude, longitude: pin.longitude }}
                  radius={radiusKm * 1000}
                  strokeColor={theme.colors.primary}
                  fillColor={theme.colors.primary + "22"}
                  strokeWidth={2}
                />
              ) : null}
            </MapView>
          )}
        </View>

        {hint ? <Text style={styles.hint}>{hint}</Text> : null}

        <View style={styles.actions}>
          {onClear && (initialPin || pin) ? (
            <SecondaryButton
              title={t("concierge.map.clearPin")}
              onPress={() => {
                onClear();
                onClose();
              }}
            />
          ) : null}
          <View style={styles.primaryBtnWrap}>
            <PrimaryButton
              title={t("concierge.map.useSpot")}
              disabled={!pin}
              icon={<Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
              onPress={() => {
                if (!pin) return;
                onConfirm(pin);
                onClose();
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: theme.colors.surface, paddingTop: Platform.OS === "ios" ? 54 : 24 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.sm,
    },
    title: { ...theme.type.h3, color: theme.colors.textPrimary },
    subtitle: {
      ...theme.type.caption,
      color: theme.colors.textSecondary,
      paddingHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.md,
    },
    mapWrap: {
      flex: 1,
      marginHorizontal: theme.spacing.lg,
      borderRadius: theme.radii.lg,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.backgroundMuted,
    },
    loading: { flex: 1, alignItems: "center", justifyContent: "center" },
    hint: {
      ...theme.type.caption,
      color: theme.colors.textSecondary,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
    },
    actions: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      padding: theme.spacing.lg,
      paddingBottom: Platform.OS === "ios" ? 28 : 16,
    },
    primaryBtnWrap: { flex: 1 },
  });
}

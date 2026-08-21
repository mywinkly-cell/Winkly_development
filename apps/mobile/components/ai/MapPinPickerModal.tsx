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
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { Colors, Typography, Layout } from "@/constants/tokens";
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
    setHint("Resolving address…");
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
          <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close map">
            <Ionicons name="close" size={24} color={Colors.gray600} />
          </TouchableOpacity>
          <Text style={styles.title}>Set precise spot</Text>
          <View style={{ width: 24 }} />
        </View>

        <Text style={styles.subtitle}>
          Tap the map to drop a pin
          {city?.trim() ? ` near ${city.trim()}` : ""}.
          {radiusKm ? ` Search radius: ${radiusKm} km.` : ""}
        </Text>

        <View style={styles.mapWrap}>
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={Colors.primaryViolet} />
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
                  title="Search center"
                  description={pin.label}
                />
              ) : null}
              {pin && radiusKm && radiusKm > 0 ? (
                <Circle
                  center={{ latitude: pin.latitude, longitude: pin.longitude }}
                  radius={radiusKm * 1000}
                  strokeColor={Colors.primaryViolet}
                  fillColor={Colors.primaryViolet + "22"}
                  strokeWidth={2}
                />
              ) : null}
            </MapView>
          )}
        </View>

        {hint ? <Text style={styles.hint}>{hint}</Text> : null}

        <View style={styles.actions}>
          {onClear && (initialPin || pin) ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                Haptics.selectionAsync();
                onClear();
                onClose();
              }}
              activeOpacity={0.9}
            >
              <Text style={styles.secondaryBtnText}>Clear pin</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.primaryBtn, !pin && styles.primaryBtnDisabled]}
            disabled={!pin}
            onPress={() => {
              if (!pin) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onConfirm(pin);
              onClose();
            }}
            activeOpacity={0.9}
          >
            <Ionicons name="checkmark" size={18} color={Colors.white} />
            <Text style={styles.primaryBtnText}>Use this spot</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: Colors.white, paddingTop: Platform.OS === "ios" ? 54 : 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.spacing.lg,
    marginBottom: 8,
  },
  title: { ...Typography.h3, color: Colors.textPrimary },
  subtitle: {
    ...Typography.caption,
    color: Colors.gray600,
    paddingHorizontal: Layout.spacing.lg,
    marginBottom: 12,
  },
  mapWrap: {
    flex: 1,
    marginHorizontal: Layout.spacing.lg,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.gray100,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  hint: {
    ...Typography.caption,
    color: Colors.gray700,
    paddingHorizontal: Layout.spacing.lg,
    paddingTop: 10,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    padding: Layout.spacing.lg,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
  },
  secondaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  secondaryBtnText: { ...Typography.caption, color: Colors.gray700, fontWeight: "700" },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primaryViolet,
    borderRadius: 14,
    paddingVertical: 14,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: { ...Typography.button, color: Colors.white },
});

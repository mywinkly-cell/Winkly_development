/**
 * Shared planning location controls:
 * - City (required)
 * - Optional search radius (km)
 * - Optional precise map pin
 * Used by Quick plan, activity details, and Concierge request form.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import {
  searchLocationAutocomplete,
  type LocationSuggestion,
} from "@/lib/weatherClient";
import { getDeviceLocationDisplay, getDeviceCoordsIfPermitted } from "@/lib/location/deviceLocation";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { MapPinPickerModal, type MapPinValue } from "@/components/ai/MapPinPickerModal";
import { PLANNING_RADIUS_KM_OPTIONS } from "@/lib/ai/conciergePlanningFlow";

export type PlanningLocationValue = {
  location: string;
  city?: string;
  country?: string;
  searchRadiusKm?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  pinLabel?: string | null;
  locationFromGps?: boolean;
};

export type PlanningLocationFieldsProps = {
  value: PlanningLocationValue;
  onChange: (next: PlanningLocationValue) => void;
  language?: string;
  /** Compact layout for Quick plan / nested forms. */
  compact?: boolean;
  /** Show section title "Location". Default true. */
  showTitle?: boolean;
  /** When true, city field is required visually (asterisk). Default true. */
  cityRequired?: boolean;
};

function parseLocation(loc: string, language: string): { city: string; country: string | undefined } {
  const norm = normalizeLocationDisplayString(loc.trim(), language);
  if (!norm) return { city: "", country: undefined };
  const lastComma = norm.lastIndexOf(",");
  if (lastComma < 0) return { city: norm, country: undefined };
  const city = norm.slice(0, lastComma).trim();
  const country = norm.slice(lastComma + 1).trim();
  return { city, country: country || undefined };
}

export function PlanningLocationFields({
  value,
  onChange,
  language = "en",
  compact = false,
  showTitle = true,
  cityRequired = true,
}: PlanningLocationFieldsProps) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const location = value.location ?? "";
  const radiusKm = value.searchRadiusKm ?? null;
  const hasPin = typeof value.latitude === "number" && typeof value.longitude === "number";
  const parsed = parseLocation(location, language);

  useEffect(() => {
    const q = location.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchLocationAutocomplete(q, language)
        .then((list) => {
          if (!cancelled) setSuggestions(list);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [location, language]);

  const patch = (partial: Partial<PlanningLocationValue>) => {
    onChange({ ...value, ...partial });
  };

  const applyLocationLine = (line: string, fromGps = false, coords?: { latitude: number; longitude: number } | null) => {
    const norm = normalizeLocationDisplayString(line, language);
    const p = parseLocation(norm, language);
    patch({
      location: norm,
      city: p.city || undefined,
      country: p.country,
      locationFromGps: fromGps,
      ...(coords
        ? {
            latitude: coords.latitude,
            longitude: coords.longitude,
            pinLabel: norm,
          }
        : {}),
    });
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {showTitle ? (
        <View style={styles.headerRow}>
          <Text style={styles.title}>
            Location{cityRequired ? <Text style={styles.required}> *</Text> : null}
          </Text>
          <TouchableOpacity
            style={styles.locatePill}
            onPress={() => {
              if (gpsLoading) return;
              Haptics.selectionAsync();
              setGpsLoading(true);
              Promise.all([getDeviceLocationDisplay(language), getDeviceCoordsIfPermitted()])
                .then(([displayRes, coords]) => {
                  if (displayRes.ok && displayRes.display) {
                    applyLocationLine(
                      displayRes.display,
                      true,
                      coords
                        ? { latitude: coords.latitude, longitude: coords.longitude }
                        : null
                    );
                  }
                })
                .finally(() => setGpsLoading(false));
            }}
            disabled={gpsLoading}
            activeOpacity={0.85}
          >
            {gpsLoading ? (
              <ActivityIndicator size="small" color={Colors.primaryViolet} />
            ) : (
              <>
                <Ionicons name="locate" size={16} color={Colors.primaryViolet} />
                <Text style={styles.locatePillText}>Use current</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.surface}>
        <TextInput
          style={styles.input}
          placeholder="City, Country"
          placeholderTextColor={Colors.gray500}
          value={location}
          onChangeText={(text) => {
            const p = parseLocation(text, language);
            patch({
              location: text,
              city: p.city || undefined,
              country: p.country,
              locationFromGps: false,
              // Changing city invalidates an old pin unless user re-sets it.
              latitude: null,
              longitude: null,
              pinLabel: null,
            });
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => {
            const norm = normalizeLocationDisplayString(location, language);
            const p = parseLocation(norm, language);
            patch({ location: norm, city: p.city || undefined, country: p.country });
            setTimeout(() => setShowDropdown(false), 200);
          }}
          autoCapitalize="words"
          autoCorrect={false}
          accessibilityLabel="City and country"
        />

        {suggestions.length > 0 && showDropdown ? (
          <View style={styles.suggestions}>
            {suggestions.slice(0, 5).map((s) => (
              <TouchableOpacity
                key={s.display}
                style={styles.suggestionItem}
                onPress={() => {
                  Haptics.selectionAsync();
                  applyLocationLine(s.display, false);
                  setSuggestions([]);
                  setShowDropdown(false);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="location-outline" size={18} color={Colors.gray500} />
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {s.display}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <Text style={styles.optionalLabel}>Search radius (optional)</Text>
        <View style={styles.radiusRow}>
          <TouchableOpacity
            style={[styles.radiusChip, radiusKm == null && styles.radiusChipOn]}
            onPress={() => {
              Haptics.selectionAsync();
              patch({ searchRadiusKm: null });
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.radiusText, radiusKm == null && styles.radiusTextOn]}>Any</Text>
          </TouchableOpacity>
          {PLANNING_RADIUS_KM_OPTIONS.map((km) => {
            const on = radiusKm === km;
            return (
              <TouchableOpacity
                key={km}
                style={[styles.radiusChip, on && styles.radiusChipOn]}
                onPress={() => {
                  Haptics.selectionAsync();
                  patch({ searchRadiusKm: km });
                }}
                activeOpacity={0.85}
              >
                <Text style={[styles.radiusText, on && styles.radiusTextOn]}>{km} km</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.mapBtn}
          onPress={() => {
            Haptics.selectionAsync();
            setMapOpen(true);
          }}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Set precise spot on map"
        >
          <Ionicons name="map-outline" size={18} color={Colors.primaryViolet} />
          <View style={styles.mapBtnCopy}>
            <Text style={styles.mapBtnTitle}>
              {hasPin ? "Precise spot set" : "Set precise spot on map"}
            </Text>
            <Text style={styles.mapBtnSub} numberOfLines={2}>
              {hasPin
                ? value.pinLabel ||
                  `${Number(value.latitude).toFixed(4)}, ${Number(value.longitude).toFixed(4)}`
                : "Optional — open the map and drop a pin"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
        </TouchableOpacity>
      </View>

      <MapPinPickerModal
        visible={mapOpen}
        city={parsed.city || value.city}
        country={parsed.country || value.country}
        radiusKm={radiusKm}
        language={language}
        initialPin={
          hasPin
            ? {
                latitude: value.latitude as number,
                longitude: value.longitude as number,
                label: value.pinLabel ?? undefined,
              }
            : null
        }
        onClose={() => setMapOpen(false)}
        onClear={() =>
          patch({ latitude: null, longitude: null, pinLabel: null })
        }
        onConfirm={(pin: MapPinValue) =>
          patch({
            latitude: pin.latitude,
            longitude: pin.longitude,
            pinLabel: pin.label ?? null,
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  wrapCompact: { marginBottom: 8 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: { ...Typography.h3, color: Colors.textPrimary, fontSize: 17 },
  required: { color: Colors.errorRed },
  locatePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Colors.secondaryViolet,
  },
  locatePillText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "700" },
  surface: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
  },
  suggestions: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
    overflow: "hidden",
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray100,
  },
  suggestionText: { ...Typography.caption, color: Colors.textPrimary, flex: 1 },
  optionalLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 8,
  },
  radiusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  radiusChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  radiusChipOn: {
    borderColor: Colors.primaryViolet,
    backgroundColor: Colors.primaryViolet + "14",
  },
  radiusText: { ...Typography.caption, color: Colors.gray700, fontWeight: "600" },
  radiusTextOn: { color: Colors.primaryViolet, fontWeight: "800" },
  mapBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: Colors.gray100,
  },
  mapBtnCopy: { flex: 1 },
  mapBtnTitle: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "800" },
  mapBtnSub: { ...Typography.caption, color: Colors.gray600, marginTop: 2 },
});

/**
 * Shared planning location controls:
 * - City (required)
 * - Optional search radius (km)
 * - Optional precise map pin
 * Used by Quick plan, activity details, and Concierge request form.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Chip, TextButton } from "@/components/ds";
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
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
            {t("concierge.location.title")}{cityRequired ? <Text style={styles.required}> *</Text> : null}
          </Text>
          <TextButton
            title={t("concierge.location.useCurrent")}
            loading={gpsLoading}
            icon={<Ionicons name="locate" size={16} color={theme.colors.primary} />}
            onPress={() => {
              if (gpsLoading) return;
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
            style={styles.locatePill}
          />
        </View>
      ) : null}

      <View style={styles.surface}>
        <TextInput
          style={styles.input}
          placeholder={t("concierge.location.placeholder")}
          placeholderTextColor={theme.colors.textMuted}
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
          accessibilityLabel={t("concierge.location.a11y")}
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
                <Ionicons name="location-outline" size={18} color={theme.colors.textMuted} />
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {s.display}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <Text style={styles.optionalLabel}>{t("concierge.location.radius")}</Text>
        <View style={styles.radiusRow}>
          <Chip
            label={t("concierge.details.setting.any")}
            selected={radiusKm == null}
            onPress={() => patch({ searchRadiusKm: null })}
          />
          {PLANNING_RADIUS_KM_OPTIONS.map((km) => (
            <Chip
              key={km}
              label={t("weeklySpark.settingsRadiusKm", { km })}
              selected={radiusKm === km}
              onPress={() => patch({ searchRadiusKm: km })}
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.mapBtn}
          onPress={() => {
            Haptics.selectionAsync();
            setMapOpen(true);
          }}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={t("concierge.location.setPin")}
        >
          <Ionicons name="map-outline" size={18} color={theme.colors.primary} />
          <View style={styles.mapBtnCopy}>
            <Text style={styles.mapBtnTitle}>
              {hasPin ? t("concierge.location.pinSet") : t("concierge.location.setPin")}
            </Text>
            <Text style={styles.mapBtnSub} numberOfLines={2}>
              {hasPin
                ? value.pinLabel ||
                  `${Number(value.latitude).toFixed(4)}, ${Number(value.longitude).toFixed(4)}`
                : t("concierge.location.pinHint")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
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

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { marginBottom: theme.spacing.md },
    wrapCompact: { marginBottom: theme.spacing.sm },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.sm,
    },
    title: { ...theme.type.h3, color: theme.colors.textPrimary, fontSize: 17 },
    required: { color: theme.colors.error },
    locatePill: {
      alignSelf: "flex-start",
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.pill,
      paddingHorizontal: theme.spacing.sm,
    },
    surface: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 11,
      ...theme.type.body,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.backgroundMuted,
    },
    suggestions: {
      marginTop: theme.spacing.xs,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: "hidden",
    },
    suggestionItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    suggestionText: { ...theme.type.caption, color: theme.colors.textPrimary, flex: 1 },
    optionalLabel: {
      ...theme.type.caption,
      color: theme.colors.textSecondary,
      fontWeight: "600",
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    radiusRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    mapBtn: {
      marginTop: theme.spacing.md,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.backgroundMuted,
    },
    mapBtnCopy: { flex: 1 },
    mapBtnTitle: { ...theme.type.caption, color: theme.colors.primary, fontWeight: "800" },
    mapBtnSub: { ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 2 },
  });
}

/**
 * Weekly Sparks settings panel — opened from the Settings button in the Sparks header.
 * Location (city + radius) can be saved once per week (Mon–Sun), then read-only until next Monday;
 * timing windows can be changed at any time.
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
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Layout, Typography } from "@/constants/tokens";
import {
  DEFAULT_WEEKLY_SPARK_RADIUS_KM,
  SMART_WEEKLY_SPARK_TIMING,
  SPARK_DAYPARTS,
  WEEKLY_SPARK_RADIUS_KM_OPTIONS,
  type SparkDaypart,
  type WeeklySparkLocationPrefs,
  type WeeklySparkTimingPrefs,
} from "@/lib/ai/weeklySparkSettings";
import {
  searchLocationAutocomplete,
  type LocationSuggestion,
} from "@/lib/weatherClient";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";

export type WeeklySparkSettingsSave = {
  location: string;
  city: string;
  country?: string;
  searchRadiusKm: number;
  timing: WeeklySparkTimingPrefs;
};

export type WeeklySparkSettingsBarProps = {
  prefs: WeeklySparkLocationPrefs | null;
  timing?: WeeklySparkTimingPrefs | null;
  /** Profile fallback while prefs load / unset. */
  defaultLocationLine?: string;
  defaultCity?: string | null;
  defaultCountry?: string | null;
  language?: string;
  saving?: boolean;
  onSave: (next: WeeklySparkSettingsSave) => void;
  onClose?: () => void;
};

function parseLocation(loc: string, language: string): { city: string; country?: string } {
  const norm = normalizeLocationDisplayString(loc.trim(), language);
  if (!norm) return { city: "" };
  const lastComma = norm.lastIndexOf(",");
  if (lastComma < 0) return { city: norm };
  return {
    city: norm.slice(0, lastComma).trim(),
    country: norm.slice(lastComma + 1).trim() || undefined,
  };
}

const DAYPART_LABEL: Record<SparkDaypart, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

function togglePart(parts: SparkDaypart[], part: SparkDaypart): SparkDaypart[] {
  const next = parts.includes(part) ? parts.filter((p) => p !== part) : [...parts, part];
  // At least one window must stay on, otherwise there is nothing to schedule.
  if (!next.length) return parts;
  return SPARK_DAYPARTS.filter((p) => next.includes(p));
}

export function WeeklySparkSettingsBar({
  prefs,
  timing,
  defaultLocationLine,
  defaultCity,
  defaultCountry,
  language = "en",
  saving = false,
  onSave,
  onClose,
}: WeeklySparkSettingsBarProps) {
  const { t } = useTranslation();
  const locked = !!prefs?.locked;
  const seedLocation =
    prefs?.location ||
    defaultLocationLine ||
    [defaultCity, defaultCountry].filter(Boolean).join(", ") ||
    "";
  const seedTiming = timing ?? SMART_WEEKLY_SPARK_TIMING;
  const [location, setLocation] = useState(seedLocation);
  const [radiusKm, setRadiusKm] = useState(
    prefs?.searchRadiusKm ?? DEFAULT_WEEKLY_SPARK_RADIUS_KM
  );
  const [smart, setSmart] = useState(seedTiming.smart);
  const [weekdayParts, setWeekdayParts] = useState<SparkDaypart[]>(seedTiming.weekdayParts);
  const [weekendParts, setWeekendParts] = useState<SparkDaypart[]>(seedTiming.weekendParts);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    setLocation(seedLocation);
    setRadiusKm(prefs?.searchRadiusKm ?? DEFAULT_WEEKLY_SPARK_RADIUS_KM);
  }, [seedLocation, prefs?.searchRadiusKm]);

  useEffect(() => {
    setSmart(seedTiming.smart);
    setWeekdayParts(seedTiming.weekdayParts);
    setWeekendParts(seedTiming.weekendParts);
  }, [seedTiming.smart, seedTiming.weekdayParts, seedTiming.weekendParts]);

  useEffect(() => {
    if (locked) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const q = location.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const tmr = setTimeout(() => {
      void searchLocationAutocomplete(q, language).then((list) => {
        if (!cancelled) {
          setSuggestions(list.slice(0, 5));
          setShowDropdown(list.length > 0);
        }
      });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(tmr);
    };
  }, [location, language, locked]);

  const canSave =
    !saving &&
    (locked || (location.trim().length >= 2 && parseLocation(location, language).city.length > 0));

  const effectiveTiming: WeeklySparkTimingPrefs = smart
    ? SMART_WEEKLY_SPARK_TIMING
    : { smart: false, weekdayParts, weekendParts };

  const renderPartRow = (
    label: string,
    parts: SparkDaypart[],
    setParts: (next: SparkDaypart[]) => void
  ) => (
    <View style={styles.partsBlock}>
      <Text style={styles.partsLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {SPARK_DAYPARTS.map((part) => {
          const active = parts.includes(part);
          return (
            <TouchableOpacity
              key={part}
              style={[styles.chip, active && styles.chipActive]}
              disabled={saving}
              onPress={() => {
                Haptics.selectionAsync();
                setParts(togglePart(parts, part));
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {DAYPART_LABEL[part]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Ionicons name="options-outline" size={18} color={Colors.primaryViolet} />
        <Text style={styles.headerTitle}>{t("weeklySpark.settingsPanelTitle")}</Text>
        {onClose ? (
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              onClose();
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          >
            <Ionicons name="close" size={20} color={Colors.gray500} />
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>{t("weeklySpark.settingsTitle")}</Text>
      <Text style={styles.note}>
        {locked ? t("weeklySpark.settingsLockedNote") : t("weeklySpark.settingsOnceWeekNote")}
      </Text>

      <Text style={styles.label}>{t("weeklySpark.settingsLocation")}</Text>
      <TextInput
        style={[styles.input, locked && styles.inputDisabled]}
        value={location}
        onChangeText={setLocation}
        editable={!locked && !saving}
        placeholder={t("weeklySpark.settingsLocationPlaceholder")}
        placeholderTextColor={Colors.gray500}
        autoCorrect={false}
      />
      {showDropdown && !locked ? (
        <View style={styles.dropdown}>
          {suggestions.map((s) => (
            <TouchableOpacity
              key={`${s.city}-${s.country ?? ""}-${s.display}`}
              style={styles.dropdownRow}
              onPress={() => {
                Haptics.selectionAsync();
                const line = s.country ? `${s.city}, ${s.country}` : s.city;
                setLocation(normalizeLocationDisplayString(line, language));
                setShowDropdown(false);
              }}
            >
              <Text style={styles.dropdownText}>{s.display || s.city}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Text style={[styles.label, { marginTop: 12 }]}>{t("weeklySpark.settingsRadius")}</Text>
      <View style={styles.chipRow}>
        {WEEKLY_SPARK_RADIUS_KM_OPTIONS.map((km) => {
          const active = radiusKm === km;
          return (
            <TouchableOpacity
              key={km}
              style={[styles.chip, active && styles.chipActive, locked && styles.inputDisabled]}
              disabled={locked || saving}
              onPress={() => {
                Haptics.selectionAsync();
                setRadiusKm(km);
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t("weeklySpark.settingsRadiusKm", { km })}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>{t("weeklySpark.settingsTimingTitle")}</Text>
      <TouchableOpacity
        style={styles.smartRow}
        onPress={() => {
          Haptics.selectionAsync();
          setSmart((v) => !v);
        }}
        disabled={saving}
        activeOpacity={0.85}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: smart }}
      >
        <Ionicons
          name={smart ? "checkbox" : "square-outline"}
          size={22}
          color={smart ? Colors.primaryViolet : Colors.gray500}
        />
        <View style={styles.smartTextCol}>
          <Text style={styles.smartTitle}>{t("weeklySpark.settingsSmartTiming")}</Text>
          <Text style={styles.note}>{t("weeklySpark.settingsSmartTimingNote")}</Text>
        </View>
      </TouchableOpacity>

      {smart ? null : (
        <>
          {renderPartRow(t("weeklySpark.settingsWeekdays"), weekdayParts, setWeekdayParts)}
          {renderPartRow(t("weeklySpark.settingsWeekend"), weekendParts, setWeekendParts)}
          <Text style={styles.note}>{t("weeklySpark.settingsCustomTimingNote")}</Text>
        </>
      )}

      <TouchableOpacity
        style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
        disabled={!canSave}
        onPress={() => {
          Haptics.selectionAsync();
          const parsed = parseLocation(location, language);
          onSave({
            location: normalizeLocationDisplayString(location, language),
            city: parsed.city,
            country: parsed.country,
            searchRadiusKm: radiusKm,
            timing: effectiveTiming,
          });
        }}
        activeOpacity={0.9}
      >
        {saving ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.saveBtnText}>
            {locked ? t("weeklySpark.settingsSaveTiming") : t("weeklySpark.settingsSave")}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
    borderRadius: Layout.radii.control,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.gray100,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  headerTitle: {
    ...Typography.caption,
    flex: 1,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.primaryViolet,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  note: {
    ...Typography.caption,
    color: Colors.gray600,
    lineHeight: 18,
    marginBottom: 10,
  },
  label: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.gray700,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    ...Typography.body,
    color: Colors.textPrimary,
  },
  inputDisabled: { opacity: 0.65 },
  dropdown: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    overflow: "hidden",
  },
  dropdownRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray200,
  },
  dropdownText: { ...Typography.caption, color: Colors.textPrimary },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  chipActive: {
    backgroundColor: Colors.primaryViolet,
    borderColor: Colors.primaryViolet,
  },
  chipText: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.gray700,
  },
  chipTextActive: { color: Colors.white },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.gray300,
    marginVertical: 14,
  },
  smartRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 4,
  },
  smartTextCol: { flex: 1 },
  smartTitle: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  partsBlock: { marginTop: 8 },
  partsLabel: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.gray700,
    marginBottom: 6,
  },
  saveBtn: {
    marginTop: 14,
    backgroundColor: Colors.primaryViolet,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: { ...Typography.button, color: Colors.white },
});

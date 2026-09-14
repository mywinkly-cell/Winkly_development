// Romance Mode – Filtering screen
// Free: distance, age, language. Subscription: interests, relationship goals. Super+: AI matching. Premium: full AI.

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Modal,
  Switch,
} from "react-native";
import { FilterAgeRangeSlider } from "@/components/filters/FilterAgeRangeSlider";
import { FilterDistanceSlider } from "@/components/filters/FilterDistanceSlider";
import {
  FILTER_SLIDER_FIELD_GAP,
  FILTER_SLIDER_VALUE_ROW_STYLE,
  filterSliderValuePillStyle,
  filterSliderValueTextStyle,
} from "@/lib/filters/filterSliderStyle";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import { Card, Chip, Header, PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import {
  LANGUAGE_OPTIONS,
  RELATIONSHIP_GOALS_OPTIONS,
  LIFESTYLE_ROMANCE,
  SMOKING_OPTIONS,
  ALCOHOL_OPTIONS,
  KIDS_OPTIONS,
  SEXUAL_VIEWS_OPTIONS,
  RELIGION_OPTIONS,
  POLITICAL_VIEWS_OPTIONS,
  VALUES_OPTIONS,
  PETS_OPTIONS,
  FOOD_OPTIONS,
  INTEREST_POPULAR_ROMANCE,
} from "@/constants/profileOptions";
import { useTranslation } from "react-i18next";
import { useModeContext } from "@/providers/ModeContextProvider";
import { useAuth } from "@/providers/AuthProvider";
import { getOwnProfileCore } from "@/lib/access/profiles";
import { getDefaultFilterLanguage } from "@/lib/appLanguageToFilter";
import {
  getRomanceAiMatchingEnabled,
  setRomanceAiMatchingEnabled,
  getRomanceFilters,
  setRomanceFilters,
  hasSavedRomanceFilters,
  lookingForToGenders,
} from "@/lib/filters/romanceFiltersStorage";
import { canUseAIFeature } from "@/lib/ai/aiFeatureGate";
import { WinklyAISpark, SparklesIcon } from "@/components/ui/WinklyAISpark";

const MAX_LANGUAGES = 5;

/**
 * "Show me" gender-preference options. `values` are matched against the
 * profile `gender` field ("Female" / "Male" / "Other"). An empty array means
 * "Everyone" (no gender filter).
 */
const GENDER_PREFERENCE_OPTIONS: { key: string; label: string; values: string[] }[] = [
  { key: "women", label: "Women", values: ["Female"] },
  { key: "men", label: "Men", values: ["Male"] },
  { key: "everyone", label: "Everyone", values: [] },
];

function genderKeyFromValues(values: string[]): string {
  if (!values || values.length === 0) return "everyone";
  const match = GENDER_PREFERENCE_OPTIONS.find(
    (o) => o.values.length === values.length && o.values.every((v) => values.includes(v)),
  );
  return match?.key ?? "everyone";
}

const DISTANCE_KM_ANY = 999;
const AGE_MIN_LIMIT = 18;
const AGE_MAX_LIMIT = 100;
const DISTANCE_MIN = 5;
const DISTANCE_MAX = 100;
const DISTANCE_STEP = 10;

/** Build dropdown list: Any first, then user's profile languages in order, then rest A–Z */
function sortedLanguageOptions(
  allOptions: string[],
  profileLanguages: string[]
): string[] {
  const rest = allOptions.filter((l) => l !== "Any");
  const setRest = new Set(rest);
  const userOrdered = profileLanguages.filter((l) => setRest.has(l));
  const userSet = new Set(userOrdered);
  const remaining = rest.filter((l) => !userSet.has(l)).sort((a, b) => a.localeCompare(b));
  return ["Any", ...userOrdered, ...remaining];
}

export default function RomanceFiltersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const { context } = useModeContext();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const romanceAccent = theme.modeAccent("romance").primary;
  const HAS_SUBSCRIPTION = context.subscription_tier !== "free";
  const HAS_AI_MATCHING = canUseAIFeature(context.subscription_tier, "smart_matching");

  // —— Basic (free) ——
  const [distanceKm, setDistanceKm] = useState<number>(50);
  const [ageMin, setAgeMin] = useState<number>(AGE_MIN_LIMIT);
  const [ageMax, setAgeMax] = useState<number>(AGE_MAX_LIMIT);
  const [seekingGenders, setSeekingGenders] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [profileLanguages, setProfileLanguages] = useState<string[]>([]);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const languageDefaultInitialized = useRef(false);

  useEffect(() => {
    if (languageDefaultInitialized.current) return;
    languageDefaultInitialized.current = true;
    setLanguages([getDefaultFilterLanguage(i18n.language ?? "en")]);
  }, [i18n.language]);

  // —— Subscription filters ——
  const [interests, setInterests] = useState<string[]>([]);
  const [relationshipGoals, setRelationshipGoals] = useState<string[]>([]);
  const [lifestyle, setLifestyle] = useState<string>("");
  const [smoking, setSmoking] = useState<string>("");
  const [alcohol, setAlcohol] = useState<string>("");
  const [kids, setKids] = useState<string>("");
  const [sexualViews, setSexualViews] = useState<string>("");
  const [religion, setReligion] = useState<string>("");
  const [politicalViews, setPoliticalViews] = useState<string>("");
  const [values, setValues] = useState<string[]>([]);
  const [pets, setPets] = useState<string[]>([]);
  const [food, setFood] = useState<string>("");

  // —— Premium (AI matching persisted) ——
  const [aiMatchingEnabled, setAiMatchingEnabled] = useState(true);

  const sortedLanguages = useMemo(
    () => sortedLanguageOptions(LANGUAGE_OPTIONS, profileLanguages),
    [profileLanguages]
  );

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const profile = await getOwnProfileCore(user.id);
      if (cancelled) return;
      const langs = (profile as { languages?: string[] | null } | null)?.languages;
      setProfileLanguages(Array.isArray(langs) ? langs : []);
      // Seed "Show me" from the onboarding "looking for" preference the first
      // time (before the user has saved any filters).
      const lookingFor = (profile as { looking_for?: string[] | null } | null)?.looking_for;
      if (!(await hasSavedRomanceFilters())) {
        const mapped = lookingForToGenders(lookingFor);
        if (!cancelled) setSeekingGenders(mapped);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const on = await getRomanceAiMatchingEnabled();
      if (!cancelled) setAiMatchingEnabled(on);
    })();
    return () => { cancelled = true; };
  }, []);

  // Load persisted filters on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await getRomanceFilters();
      if (cancelled) return;
      setDistanceKm(saved.distanceKm);
      setAgeMin(saved.ageMin);
      setAgeMax(saved.ageMax);
      setSeekingGenders(saved.seekingGenders ?? []);
      setLanguages(saved.languages.length ? saved.languages : [getDefaultFilterLanguage(i18n.language ?? "en")]);
      setInterests(saved.interests);
      setRelationshipGoals(saved.relationshipGoals);
      setLifestyle(saved.lifestyle);
      setSmoking(saved.smoking);
      setAlcohol(saved.alcohol);
      setKids(saved.kids);
      setSexualViews(saved.sexualViews);
      setReligion(saved.religion);
      setPoliticalViews(saved.politicalViews);
      setValues(saved.values);
      setPets(saved.pets);
      setFood(saved.food);
    })();
    return () => { cancelled = true; };
  }, [i18n.language]);

  const toggleLanguage = (lang: string) => {
    Haptics.selectionAsync();
    if (lang === "Any") {
      setLanguages(["Any"]);
      return;
    }
    setLanguages((prev) => {
      const next = prev.filter((l) => l !== "Any");
      if (next.includes(lang)) return next.length > 1 ? next.filter((l) => l !== lang) : [getDefaultFilterLanguage(i18n.language ?? "en")];
      if (next.length >= MAX_LANGUAGES) return prev;
      return [...next, lang];
    });
  };

  const languageLabel =
    languages.length === 0
      ? getDefaultFilterLanguage(i18n.language ?? "en")
      : languages.includes("Any")
        ? "Any"
        : languages.slice(0, MAX_LANGUAGES).join(", ");

  const toggleChip = (arr: string[], val: string, setter: (v: string[]) => void, max: number) => {
    Haptics.selectionAsync();
    if (arr.includes(val)) {
      setter(arr.filter((x) => x !== val));
    } else if (arr.length < max) {
      setter([...arr, val]);
    }
  };

  const handleApply = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await setRomanceAiMatchingEnabled(aiMatchingEnabled);
    await setRomanceFilters({
      distanceKm,
      ageMin,
      ageMax,
      seekingGenders,
      languages,
      interests,
      relationshipGoals,
      lifestyle,
      smoking,
      alcohol,
      kids,
      sexualViews,
      religion,
      politicalViews,
      values,
      pets,
      food,
    });
    router.back();
  };

  const lockSubscription = () => {
    Alert.alert(
      "More filters with Subscription",
      "Filter by interests, relationship goals, lifestyle, and more. Upgrade in Account → Subscription.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "View plans", onPress: () => router.push("/account/subscription") },
      ]
    );
  };

  const lockAI = () => {
    Alert.alert(
      "Smart AI matching",
      "Winkly AI analyses profiles and surfaces better matches for you. Upgrade to Super or Premium in Account.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "See plans", onPress: () => router.push("/account/subscription") },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Filtering" onBack={() => router.back()} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* —— Basic settings (all users, all tariffs) —— */}
        <Card style={{ ...styles.sectionCard, ...styles.sectionCardBasic }}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Basic settings</Text>
            <View style={{ ...styles.badge, backgroundColor: romanceAccent }}>
              <Ionicons name="checkmark-circle" size={14} color={theme.colors.onPrimary} />
              <Text style={styles.badgeText}>All users</Text>
            </View>
          </View>
          <Text style={styles.sectionHint}>Distance and age — available on all tariffs.</Text>

          <Text style={styles.label}>Distance (max)</Text>
          {distanceKm === DISTANCE_KM_ANY ? (
            <View style={styles.chipRow}>
              <Text style={{ ...styles.chipText, marginRight: theme.spacing.sm }}>Any distance</Text>
              <Chip
                label="Set limit"
                onPress={() => {
                  Haptics.selectionAsync();
                  setDistanceKm(50);
                }}
              />
            </View>
          ) : (
            <>
              <View style={FILTER_SLIDER_VALUE_ROW_STYLE}>
                <View style={filterSliderValuePillStyle(theme)}>
                  <Text style={filterSliderValueTextStyle(theme)}>{distanceKm} km</Text>
                </View>
                <Chip
                  label="Any"
                  onPress={() => {
                    Haptics.selectionAsync();
                    setDistanceKm(DISTANCE_KM_ANY);
                  }}
                />
              </View>
              <FilterDistanceSlider
                min={DISTANCE_MIN}
                max={DISTANCE_MAX}
                step={DISTANCE_STEP}
                value={distanceKm}
                onChange={(v) => {
                  setDistanceKm(Math.round(v));
                  Haptics.selectionAsync();
                }}
                primaryColor={romanceAccent}
              />
            </>
          )}

          <Text style={{ ...styles.label, marginTop: theme.spacing.xl }}>Show me</Text>
          <View style={styles.segmentRow}>
            {GENDER_PREFERENCE_OPTIONS.map((opt) => {
              const selected = genderKeyFromValues(seekingGenders) === opt.key;
              return (
                <Chip
                  key={opt.key}
                  label={opt.label}
                  mode="romance"
                  selected={selected}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSeekingGenders(opt.values);
                  }}
                  style={styles.segment}
                />
              );
            })}
          </View>

          <Text style={{ ...styles.label, marginTop: FILTER_SLIDER_FIELD_GAP }}>Age range</Text>
          <View style={FILTER_SLIDER_VALUE_ROW_STYLE}>
            <View style={filterSliderValuePillStyle(theme)}>
              <Text style={filterSliderValueTextStyle(theme)}>{ageMin} – {ageMax}</Text>
            </View>
          </View>
          <FilterAgeRangeSlider
            min={AGE_MIN_LIMIT}
            max={AGE_MAX_LIMIT}
            ageMin={ageMin}
            ageMax={ageMax}
            onAgeMinChange={(v) => {
              setAgeMin(Math.round(v));
              Haptics.selectionAsync();
            }}
            onAgeMaxChange={(v) => {
              setAgeMax(Math.round(v));
              Haptics.selectionAsync();
            }}
            primaryColor={romanceAccent}
          />

          <Text style={{ ...styles.label, marginTop: theme.spacing.xl }}>Language</Text>
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setLanguageModalVisible(true);
            }}
            style={styles.languageDropdownTrigger}
          >
            <Text style={styles.languageDropdownText} numberOfLines={1}>
              {languageLabel}
            </Text>
            <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
          </Pressable>
          <Text style={styles.languageHint}>Up to {MAX_LANGUAGES} languages. Your profile languages appear first.</Text>

          <Modal
            visible={languageModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setLanguageModalVisible(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setLanguageModalVisible(false)}>
              <Pressable style={styles.languageModalContent} onPress={(e) => e.stopPropagation()}>
                <View style={styles.languageModalHeader}>
                  <Text style={styles.languageModalTitle}>Choose languages</Text>
                  <Text style={styles.languageModalSubtitle}>Up to {MAX_LANGUAGES} (your profile languages first)</Text>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync();
                      setLanguageModalVisible(false);
                    }}
                    style={styles.languageModalClose}
                    hitSlop={12}
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={styles.languageModalList}
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                >
                  {sortedLanguages.map((lang) => {
                    const isAny = lang === "Any";
                    const selected =
                      languages.includes(lang) || (languages.includes("Any") && isAny);
                    const anySelected = languages.includes("Any");
                    const atMax = !selected && !isAny && languages.filter((l) => l !== "Any").length >= MAX_LANGUAGES;
                    const disabled = anySelected ? !isAny : atMax;
                    return (
                      <Pressable
                        key={lang}
                        onPress={() => !disabled && toggleLanguage(lang)}
                        style={[
                          styles.languageModalRow,
                          selected && styles.languageModalRowSelected,
                          disabled && !selected && styles.languageModalRowDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.languageModalRowText,
                            selected && styles.languageModalRowTextSelected,
                            disabled && !selected && styles.languageModalRowTextDisabled,
                          ]}
                          numberOfLines={1}
                        >
                          {lang}
                        </Text>
                        {selected && (
                          <Ionicons name="checkmark-circle" size={22} color={romanceAccent} />
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <View style={styles.languageModalFooter}>
                  <TextButton
                    title="Done"
                    onPress={() => {
                      Haptics.selectionAsync();
                      setLanguageModalVisible(false);
                    }}
                    style={styles.languageModalDoneBtn}
                    textStyle={{ color: theme.colors.onPrimary }}
                  />
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </Card>

        {/* —— Subscription: AI-powered matching —— */}
        <Card style={{ ...styles.sectionCard, ...styles.sectionCardSubscription }}>
          <View style={styles.sectionHeaderRowWithBadge}>
            <View style={styles.sectionHeaderTitleWrap}>
              <WinklyAISpark feature="smart_matching" size={24} style={{ marginRight: theme.spacing.xxs }} />
              <Text style={styles.sectionTitle} numberOfLines={2}>AI-powered matching</Text>
            </View>
            <View style={{ ...styles.badge, backgroundColor: romanceAccent }}>
              <Ionicons name="lock-closed" size={12} color={theme.colors.onPrimary} />
              <Text style={styles.badgeText}>Subscription</Text>
            </View>
          </View>
          <Text style={styles.sectionHint}>
            AI matching re-ranks your feed using behavioral signals — how people you connect with tend
            to interact, not just shared interests. Turning this off uses a simpler, interest-based
            order.
          </Text>

          {HAS_AI_MATCHING ? (
            <View style={styles.toggleRow}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: theme.spacing.md }}>
                <View style={{ marginRight: theme.spacing.sm }}>
                  <SparklesIcon size={16} color={romanceAccent} />
                </View>
                <Text style={styles.toggleLabel}>Use AI to improve my match order</Text>
              </View>
              <Switch
                value={aiMatchingEnabled}
                onValueChange={(next) => {
                  Haptics.selectionAsync();
                  setAiMatchingEnabled(next);
                  setRomanceAiMatchingEnabled(next);
                }}
                trackColor={{ false: theme.colors.border, true: romanceAccent }}
                thumbColor={theme.colors.onPrimary}
              />
            </View>
          ) : (
            <TouchableOpacity style={styles.upsellCard} onPress={lockAI} activeOpacity={0.9}>
              <SparklesIcon size={28} color={theme.colors.textMuted} />
              <Text style={styles.upsellTitle}>Better matches with AI</Text>
              <Text style={styles.upsellText}>
                Super and Premium use AI to rank and suggest people who are a better fit for you.
              </Text>
              <Text style={styles.upsellCta}>See plans</Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* —— Subscription: more filters —— */}
        <Card style={{ ...styles.sectionCard, ...styles.sectionCardSubscription }}>
          <View style={styles.sectionHeaderRowWithBadge}>
            <View style={styles.sectionHeaderTitleWrap}>
              <Text style={styles.sectionTitle} numberOfLines={2}>More filters</Text>
            </View>
            <View style={{ ...styles.badge, backgroundColor: romanceAccent }}>
              <Ionicons name="lock-closed" size={12} color={theme.colors.onPrimary} />
              <Text style={styles.badgeText}>Subscription</Text>
            </View>
          </View>
          <Text style={styles.sectionHint}>
            {HAS_SUBSCRIPTION
              ? "Filter by interests, goals, and lifestyle."
              : "With a subscription you can filter by interests, relationship goals, and all Romance profile fields."}
          </Text>

          {HAS_SUBSCRIPTION ? (
            <>
              <Text style={styles.label}>Interests</Text>
              <View style={styles.chipRowWrap}>
                {INTEREST_POPULAR_ROMANCE.map((i) => (
                  <Chip key={i} label={i} mode="romance" selected={interests.includes(i)} onPress={() => toggleChip(interests, i, setInterests, 8)} />
                ))}
              </View>
              <Text style={styles.label}>Relationship goals (up to 2)</Text>
              <View style={styles.chipRowWrap}>
                {RELATIONSHIP_GOALS_OPTIONS.map((g) => (
                  <Chip key={g} label={g} mode="romance" selected={relationshipGoals.includes(g)} onPress={() => toggleChip(relationshipGoals, g, setRelationshipGoals, 2)} />
                ))}
              </View>
              <Text style={styles.label}>Lifestyle</Text>
              <View style={styles.chipRowWrap}>
                {LIFESTYLE_ROMANCE.map((l) => (
                  <Chip key={l} label={l} mode="romance" selected={lifestyle === l} onPress={() => setLifestyle(lifestyle === l ? "" : l)} />
                ))}
              </View>
              <Text style={styles.label}>Smoking · Alcohol · Kids</Text>
              <View style={styles.chipRowWrap}>
                {SMOKING_OPTIONS.slice(0, 4).map((s) => (
                  <Chip key={s} label={s} mode="romance" selected={smoking === s} onPress={() => setSmoking(smoking === s ? "" : s)} />
                ))}
              </View>
              <View style={styles.chipRowWrap}>
                {ALCOHOL_OPTIONS.slice(0, 4).map((a) => (
                  <Chip key={a} label={a} mode="romance" selected={alcohol === a} onPress={() => setAlcohol(alcohol === a ? "" : a)} />
                ))}
              </View>
              <View style={styles.chipRowWrap}>
                {KIDS_OPTIONS.slice(0, 5).map((k) => (
                  <Chip key={k} label={k} mode="romance" selected={kids === k} onPress={() => setKids(kids === k ? "" : k)} />
                ))}
              </View>
              <Text style={styles.label}>Values (up to 3)</Text>
              <View style={styles.chipRowWrap}>
                {VALUES_OPTIONS.slice(0, 8).map((v) => (
                  <Chip key={v} label={v} mode="romance" selected={values.includes(v)} onPress={() => toggleChip(values, v, setValues, 3)} />
                ))}
              </View>
              <Text style={styles.label}>Sexual orientation</Text>
              <View style={styles.chipRowWrap}>
                {SEXUAL_VIEWS_OPTIONS.slice(0, 5).map((s) => (
                  <Chip key={s} label={s} mode="romance" selected={sexualViews === s} onPress={() => setSexualViews(sexualViews === s ? "" : s)} />
                ))}
              </View>
              <Text style={styles.label}>Religion · Politics · Food</Text>
              <View style={styles.chipRowWrap}>
                {RELIGION_OPTIONS.slice(0, 5).map((r) => (
                  <Chip key={r} label={r} mode="romance" selected={religion === r} onPress={() => setReligion(religion === r ? "" : r)} />
                ))}
              </View>
              <View style={styles.chipRowWrap}>
                {POLITICAL_VIEWS_OPTIONS.map((p) => (
                  <Chip key={p} label={p} mode="romance" selected={politicalViews === p} onPress={() => setPoliticalViews(politicalViews === p ? "" : p)} />
                ))}
              </View>
              <View style={styles.chipRowWrap}>
                {FOOD_OPTIONS.slice(0, 6).map((f) => (
                  <Chip key={f} label={f} mode="romance" selected={food === f} onPress={() => setFood(food === f ? "" : f)} />
                ))}
              </View>
              <Text style={styles.label}>Pets (up to 2)</Text>
              <View style={styles.chipRowWrap}>
                {PETS_OPTIONS.map((p) => (
                  <Chip key={p} label={p} mode="romance" selected={pets.includes(p)} onPress={() => toggleChip(pets, p, setPets, 2)} />
                ))}
              </View>
            </>
          ) : (
            <TouchableOpacity style={styles.upsellCard} onPress={lockSubscription} activeOpacity={0.9}>
              <Ionicons name="lock-closed" size={28} color={theme.colors.textMuted} />
              <Text style={styles.upsellTitle}>Unlock more filters</Text>
              <Text style={styles.upsellText}>
                Filter by interests, relationship goals, lifestyle, religion, values, and more.
              </Text>
              <Text style={styles.upsellCta}>View subscription plans</Text>
            </TouchableOpacity>
          )}
        </Card>

        <PrimaryButton title="Apply filters" onPress={handleApply} style={{ backgroundColor: romanceAccent }} />
        <View style={{ height: theme.spacing.huge }} />
      </ScrollView>
      <RomanceBottomNav />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const romanceAccent = theme.modeAccent("romance").primary;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    scroll: { flex: 1 },
    scrollContent: { padding: theme.spacing.xl, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
    sectionCard: { marginBottom: theme.spacing.xxl },
    sectionCardBasic: {
      borderLeftWidth: 4,
      borderLeftColor: romanceAccent,
    },
    sectionCardSubscription: {
      borderLeftWidth: 4,
      borderLeftColor: romanceAccent,
    },
    sectionHeaderRowWithBadge: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: theme.spacing.xxs,
      gap: theme.spacing.md,
    },
    sectionHeaderTitleWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      minWidth: 0,
    },
    sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginBottom: theme.spacing.xxs },
    badge: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xxs,
      paddingVertical: 5,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.sm,
    },
    badgeText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontSize: 11,
      fontWeight: "600",
      color: theme.colors.onPrimary,
    },
    sectionTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
    },
    sectionHint: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.md,
    },
    label: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontWeight: "600",
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.lg,
    },
    chipRowWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    chipText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textPrimary,
      fontWeight: "500",
    },
    segmentRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
    },
    segment: { flex: 1, alignItems: "center" },
    languageDropdownTrigger: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      minHeight: 48,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      marginTop: theme.spacing.sm,
    },
    languageDropdownText: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textPrimary,
      flex: 1,
      marginRight: theme.spacing.sm,
    },
    languageHint: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xs,
      marginLeft: 2,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      justifyContent: "center",
      alignItems: "center",
      padding: theme.spacing.xl,
    },
    languageModalContent: {
      width: "100%",
      maxWidth: 400,
      maxHeight: "80%",
      backgroundColor: theme.colors.background,
      borderRadius: theme.radii.lg,
      overflow: "hidden",
      ...theme.elevation(3),
    },
    languageModalHeader: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    languageModalTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.xxs,
    },
    languageModalSubtitle: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    languageModalClose: {
      position: "absolute",
      top: theme.spacing.md,
      right: theme.spacing.md,
      padding: theme.spacing.xxs,
    },
    languageModalList: {
      maxHeight: 320,
      paddingVertical: theme.spacing.sm,
    },
    languageModalRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.xl,
    },
    languageModalRowSelected: {
      backgroundColor: theme.modeAccent("romance").bg,
    },
    languageModalRowDisabled: {
      opacity: 0.5,
    },
    languageModalRowText: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textPrimary,
      flex: 1,
    },
    languageModalRowTextSelected: {
      fontWeight: "600",
      color: romanceAccent,
    },
    languageModalRowTextDisabled: {
      color: theme.colors.textMuted,
    },
    languageModalFooter: {
      padding: theme.spacing.xl,
      paddingTop: theme.spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    languageModalDoneBtn: {
      backgroundColor: romanceAccent,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radii.md,
      alignItems: "center",
      alignSelf: "stretch",
    },
    upsellCard: {
      padding: theme.spacing.xxl,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    upsellTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    upsellText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: theme.spacing.md,
    },
    upsellCta: {
      ...theme.type.button,
      fontFamily: theme.type.button.fontFamily,
      fontSize: 14,
      color: romanceAccent,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.backgroundMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    toggleLabel: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textPrimary,
      flex: 1,
      marginRight: theme.spacing.md,
    },
  });
}

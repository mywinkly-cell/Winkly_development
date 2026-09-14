// Friends Mode – Filtering screen
// Basic settings (distance, age) = all users. Rest + AI = subscription only.

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
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
import { FriendsBottomNav } from "@/components/layout/FriendsBottomNav";
import { Card, Chip, Header, PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import {
  LANGUAGE_OPTIONS,
  MEETUP_GOALS_OPTIONS,
  INTEREST_POPULAR_FRIENDS,
  PETS_OPTIONS,
  FOOD_OPTIONS,
} from "@/constants/profileOptions";
import { useTranslation } from "react-i18next";
import { useModeContext } from "@/providers/ModeContextProvider";
import { useAuth } from "@/providers/AuthProvider";
import { getOwnProfileCore } from "@/lib/access/profiles";
import { getDefaultFilterLanguage } from "@/lib/appLanguageToFilter";
import { canUseAIFeature } from "@/lib/ai/aiFeatureGate";
import { WinklyAISpark, SparklesIcon } from "@/components/ui/WinklyAISpark";
import {
  getFriendsFilters,
  setFriendsFilters,
  getFriendsAiMatchingEnabled,
  setFriendsAiMatchingEnabled,
} from "@/lib/filters/friendsFiltersStorage";

const DISTANCE_KM_ANY = 999;
const AGE_MIN_LIMIT = 18;
const AGE_MAX_LIMIT = 100;
const DISTANCE_MIN = 5;
const DISTANCE_MAX = 100;
const DISTANCE_STEP = 10;
const MAX_LANGUAGES = 5;

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

export default function FriendsFiltersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const { context } = useModeContext();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const friendsAccent = theme.modeAccent("friends").primary;
  const HAS_SUBSCRIPTION = context.subscription_tier !== "free";
  const HAS_AI_MATCHING = canUseAIFeature(context.subscription_tier, "smart_matching");

  const [distanceKm, setDistanceKm] = useState<number>(50);
  const [ageMin, setAgeMin] = useState<number>(AGE_MIN_LIMIT);
  const [ageMax, setAgeMax] = useState<number>(AGE_MAX_LIMIT);
  const [languages, setLanguages] = useState<string[]>([]);
  const [profileLanguages, setProfileLanguages] = useState<string[]>([]);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const languageDefaultInitialized = useRef(false);

  useEffect(() => {
    if (languageDefaultInitialized.current) return;
    languageDefaultInitialized.current = true;
    setLanguages([getDefaultFilterLanguage(i18n.language ?? "en")]);
  }, [i18n.language]);
  const [interests, setInterests] = useState<string[]>([]);
  const [meetupGoals, setMeetupGoals] = useState<string[]>([]);
  const [pets, setPets] = useState<string[]>([]);
  const [food, setFood] = useState<string>("");
  const [aiMatchingEnabled, setAiMatchingEnabled] = useState(false);

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
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Load persisted filters and AI matching on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [saved, aiOn] = await Promise.all([getFriendsFilters(), getFriendsAiMatchingEnabled()]);
      if (cancelled) return;
      setDistanceKm(saved.distanceKm);
      setAgeMin(saved.ageMin);
      setAgeMax(saved.ageMax);
      setLanguages(saved.languages.length ? saved.languages : [getDefaultFilterLanguage(i18n.language ?? "en")]);
      setInterests(saved.interests);
      setMeetupGoals(saved.meetupGoals);
      setPets(saved.pets);
      setFood(saved.food);
      setAiMatchingEnabled(aiOn);
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
    await setFriendsAiMatchingEnabled(aiMatchingEnabled);
    await setFriendsFilters({
      distanceKm,
      ageMin,
      ageMax,
      languages,
      interests,
      meetupGoals,
      pets,
      food,
    });
    router.back();
  };

  const lockSubscription = () => {
    Haptics.selectionAsync();
    router.push("/account/subscription");
  };

  const lockAI = () => {
    Haptics.selectionAsync();
    router.push("/account/subscription");
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
            <View style={{ ...styles.badge, backgroundColor: friendsAccent }}>
              <Ionicons name="checkmark-circle" size={14} color={theme.colors.onPrimary} />
              <Text style={styles.badgeText}>All users</Text>
            </View>
          </View>
          <Text style={styles.sectionHint}>Distance and age — available on all tariffs.</Text>

          <Text style={styles.label}>Distance (max)</Text>
          {distanceKm === DISTANCE_KM_ANY ? (
            <View style={styles.chipRow}>
              <Text style={{ ...styles.chipText, marginRight: theme.spacing.sm }}>Any distance</Text>
              <Chip label="Set limit" onPress={() => { Haptics.selectionAsync(); setDistanceKm(50); }} />
            </View>
          ) : (
            <>
              <View style={FILTER_SLIDER_VALUE_ROW_STYLE}>
                <View style={filterSliderValuePillStyle(theme)}>
                  <Text style={filterSliderValueTextStyle(theme)}>{distanceKm} km</Text>
                </View>
                <Chip label="Any" onPress={() => { Haptics.selectionAsync(); setDistanceKm(DISTANCE_KM_ANY); }} />
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
                primaryColor={friendsAccent}
              />
            </>
          )}

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
            primaryColor={friendsAccent}
          />
        </Card>

        {/* —— Subscription: AI-powered matching —— */}
        <Card style={{ ...styles.sectionCard, ...styles.sectionCardSubscription }}>
          <View style={styles.sectionHeaderRowWithBadge}>
            <View style={styles.sectionHeaderTitleWrap}>
              <WinklyAISpark feature="smart_matching" size={24} style={{ marginRight: theme.spacing.xxs }} />
              <Text style={styles.sectionTitle} numberOfLines={2}>AI-powered matching</Text>
            </View>
            <View style={{ ...styles.badge, backgroundColor: friendsAccent }}>
              <Ionicons name="lock-closed" size={12} color={theme.colors.onPrimary} />
              <Text style={styles.badgeText}>Subscription</Text>
            </View>
          </View>
          <Text style={styles.sectionHint}>
            Use AI to surface people who fit you better.
          </Text>
          {HAS_AI_MATCHING ? (
            <View style={styles.toggleRow}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: theme.spacing.md }}>
                <SparklesIcon size={16} color={friendsAccent} />
                <Text style={styles.toggleLabel}>Use AI to improve my match order</Text>
              </View>
              <Switch
                value={aiMatchingEnabled}
                onValueChange={() => { Haptics.selectionAsync(); setAiMatchingEnabled((v) => !v); }}
                trackColor={{ false: theme.colors.border, true: friendsAccent }}
                thumbColor={theme.colors.onPrimary}
              />
            </View>
          ) : (
            <TouchableOpacity style={styles.upsellCard} onPress={lockAI} activeOpacity={0.9}>
              <SparklesIcon size={28} color={theme.colors.textMuted} />
              <Text style={styles.upsellTitle}>Better matches with AI</Text>
              <Text style={styles.upsellText}>Super and Premium use AI to rank and suggest people who are a better fit.</Text>
              <Text style={styles.upsellCta}>See plans</Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* —— Subscription: More filters (Friends sub-profile) —— */}
        <Card style={{ ...styles.sectionCard, ...styles.sectionCardSubscription }}>
          <View style={styles.sectionHeaderRowWithBadge}>
            <View style={styles.sectionHeaderTitleWrap}>
              <Text style={styles.sectionTitle} numberOfLines={2}>More filters</Text>
            </View>
            <View style={{ ...styles.badge, backgroundColor: friendsAccent }}>
              <Ionicons name="lock-closed" size={12} color={theme.colors.onPrimary} />
              <Text style={styles.badgeText}>Subscription</Text>
            </View>
          </View>
          <Text style={styles.sectionHint}>
            {HAS_SUBSCRIPTION
              ? "Filter by interests, meetup style, language, and Friends profile fields."
              : "With a subscription you can filter by interests, meetup goals, language, pets, food, and more."}
          </Text>

          {HAS_SUBSCRIPTION ? (
            <>
              <Text style={styles.label}>Language</Text>
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
                              selected && styles.languageModalRowSelectedFriends,
                              disabled && !selected && styles.languageModalRowDisabled,
                            ]}
                          >
                            <Text
                              style={[
                                styles.languageModalRowText,
                                selected && styles.languageModalRowTextSelectedFriends,
                                disabled && !selected && styles.languageModalRowTextDisabled,
                              ]}
                              numberOfLines={1}
                            >
                              {lang}
                            </Text>
                            {selected && (
                              <Ionicons name="checkmark-circle" size={22} color={friendsAccent} />
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
                        style={{ ...styles.languageModalDoneBtn, backgroundColor: friendsAccent }}
                        textStyle={{ color: theme.colors.onPrimary }}
                      />
                    </View>
                  </Pressable>
                </Pressable>
              </Modal>

              <Text style={styles.label}>Interests (up to 6)</Text>
              <View style={styles.chipRowWrap}>
                {INTEREST_POPULAR_FRIENDS.map((i) => (
                  <Chip key={i} label={i} mode="friends" selected={interests.includes(i)} onPress={() => toggleChip(interests, i, setInterests, 6)} />
                ))}
              </View>
              <Text style={styles.label}>Meetup style (up to 3)</Text>
              <View style={styles.chipRowWrap}>
                {MEETUP_GOALS_OPTIONS.map((g) => (
                  <Chip key={g} label={g} mode="friends" selected={meetupGoals.includes(g)} onPress={() => toggleChip(meetupGoals, g, setMeetupGoals, 3)} />
                ))}
              </View>
              <Text style={styles.label}>Pets (up to 2)</Text>
              <View style={styles.chipRowWrap}>
                {PETS_OPTIONS.map((p) => (
                  <Chip key={p} label={p} mode="friends" selected={pets.includes(p)} onPress={() => toggleChip(pets, p, setPets, 2)} />
                ))}
              </View>
              <Text style={styles.label}>Food preferences</Text>
              <View style={styles.chipRowWrap}>
                {FOOD_OPTIONS.slice(0, 6).map((f) => (
                  <Chip key={f} label={f} mode="friends" selected={food === f} onPress={() => setFood(food === f ? "" : f)} />
                ))}
              </View>
            </>
          ) : (
            <TouchableOpacity style={styles.upsellCard} onPress={lockSubscription} activeOpacity={0.9}>
              <Ionicons name="lock-closed" size={28} color={theme.colors.textMuted} />
              <Text style={styles.upsellTitle}>Unlock more filters</Text>
              <Text style={styles.upsellText}>
                Filter by interests, meetup style, language, pets, food, and all Friends profile fields.
              </Text>
              <Text style={styles.upsellCta}>View subscription plans</Text>
            </TouchableOpacity>
          )}
        </Card>

        <PrimaryButton title="Apply filters" onPress={handleApply} style={{ backgroundColor: friendsAccent }} />
        <View style={{ height: theme.spacing.huge }} />
      </ScrollView>
      <FriendsBottomNav />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  const friendsAccent = theme.modeAccent("friends").primary;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    scroll: { flex: 1 },
    scrollContent: { padding: theme.spacing.xl, paddingTop: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
    sectionCard: { marginBottom: theme.spacing.xxl },
    sectionCardBasic: {
      borderLeftWidth: 4,
      borderLeftColor: friendsAccent,
    },
    sectionCardSubscription: {
      borderLeftWidth: 4,
      borderLeftColor: friendsAccent,
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
    languageModalRowSelectedFriends: {
      backgroundColor: theme.modeAccent("friends").bg,
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
    languageModalRowTextSelectedFriends: {
      fontWeight: "600",
      color: friendsAccent,
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
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radii.md,
      alignItems: "center",
      alignSelf: "stretch",
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: theme.spacing.sm,
    },
    toggleLabel: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      fontSize: 14,
      color: theme.colors.textPrimary,
    },
    upsellCard: {
      padding: theme.spacing.xl,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    upsellTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      fontSize: 16,
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.xxs,
      color: theme.colors.textPrimary,
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
      color: friendsAccent,
      fontWeight: "600",
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
  });
}

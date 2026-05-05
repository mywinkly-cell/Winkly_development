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
  Platform,
  Modal,
} from "react-native";
import Slider from "@react-native-community/slider";
import RangeSlider from "react-native-range-slider-expo";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { FriendsBottomNav } from "@/components/layout/FriendsBottomNav";
import { Colors, Typography, Layout, FontFamily, HEADER } from "@/constants/tokens";
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
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.9}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Filtering</Text>
        <View style={styles.headerRight} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* —— Basic settings (all users, all tariffs) —— */}
        <View style={[styles.sectionCard, styles.sectionCardBasic]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Basic settings</Text>
            <View style={styles.badgeFree}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.white} />
              <Text style={styles.badgeFreeText}>All users</Text>
            </View>
          </View>
          <Text style={styles.sectionHint}>Distance and age — available on all tariffs.</Text>

          <Text style={styles.label}>Distance (max)</Text>
          {distanceKm === DISTANCE_KM_ANY ? (
            <View style={styles.chipRow}>
              <Text style={[styles.chipText, { marginRight: 8 }]}>Any distance</Text>
              <Pressable onPress={() => { Haptics.selectionAsync(); setDistanceKm(50); }} style={styles.chip}>
                <Text style={styles.chipText}>Set limit</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.sliderValueRow}>
                <Text style={styles.sliderValue}>{distanceKm} km</Text>
                <Pressable onPress={() => { Haptics.selectionAsync(); setDistanceKm(DISTANCE_KM_ANY); }} style={styles.chip}>
                  <Text style={styles.chipText}>Any</Text>
                </Pressable>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={DISTANCE_MIN}
                maximumValue={DISTANCE_MAX}
                step={DISTANCE_STEP}
                value={distanceKm}
                onValueChange={(v) => setDistanceKm(Math.round(v))}
                minimumTrackTintColor={Colors.friends.primary}
                maximumTrackTintColor={Colors.gray300}
                thumbTintColor={Colors.friends.primary}
                onSlidingStart={() => Haptics.selectionAsync()}
              />
            </>
          )}

          <Text style={[styles.label, { marginTop: 20 }]}>Age range</Text>
          <View style={styles.sliderValueRow}>
            <Text style={styles.sliderValue}>{ageMin} – {ageMax}</Text>
          </View>
          <View style={styles.rangeSliderWrap}>
            <RangeSlider
              min={AGE_MIN_LIMIT}
              max={AGE_MAX_LIMIT}
              step={1}
              initialFromValue={ageMin}
              initialToValue={ageMax}
              fromValueOnChange={(v) => {
                const n = Math.round(v);
                setAgeMin(n);
                Haptics.selectionAsync();
              }}
              toValueOnChange={(v) => {
                const n = Math.round(v);
                setAgeMax(n);
                Haptics.selectionAsync();
              }}
              fromKnobColor={Colors.friends.primary}
              toKnobColor={Colors.friends.primary}
              inRangeBarColor={Colors.friends.primary}
              outOfRangeBarColor={Colors.gray300}
              showRangeLabels={false}
              showValueLabels={false}
              barHeight={4}
              knobSize={28}
            />
          </View>
        </View>

        {/* —— Subscription: AI-powered matching —— */}
        <View style={[styles.sectionCard, styles.sectionCardSubscription]}>
          <View style={styles.sectionHeaderRowWithBadge}>
            <View style={styles.sectionHeaderTitleWrap}>
              <WinklyAISpark feature="smart_matching" size={HEADER.iconSize} style={{ marginRight: 4 }} />
              <Text style={styles.sectionTitle} numberOfLines={2}>AI-powered matching</Text>
            </View>
            <View style={[styles.badge, styles.badgeSubscription]}>
              <Ionicons name="lock-closed" size={12} color={Colors.white} />
              <Text style={styles.badgeText}>Subscription</Text>
            </View>
          </View>
          <Text style={styles.sectionHint}>
            Use AI to surface people who fit you better.
          </Text>
          {HAS_AI_MATCHING ? (
            <View style={styles.toggleRow}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12 }}>
                <SparklesIcon size={16} color={Colors.friends.primary} />
                <Text style={styles.toggleLabel}>Use AI to improve my match order</Text>
              </View>
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setAiMatchingEnabled((v) => !v); }}
                style={[styles.toggleTrack, aiMatchingEnabled && styles.toggleTrackOn]}
              >
                <View style={[styles.toggleThumb, aiMatchingEnabled && styles.toggleThumbOn]} />
              </Pressable>
            </View>
          ) : (
            <TouchableOpacity style={styles.upsellCard} onPress={lockAI} activeOpacity={0.9}>
              <SparklesIcon size={28} color={Colors.gray400} />
              <Text style={styles.upsellTitle}>Better matches with AI</Text>
              <Text style={styles.upsellText}>Super and Premium use AI to rank and suggest people who are a better fit.</Text>
              <Text style={styles.upsellCta}>See plans</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* —— Subscription: More filters (Friends sub-profile) —— */}
        <View style={[styles.sectionCard, styles.sectionCardSubscription]}>
          <View style={styles.sectionHeaderRowWithBadge}>
            <View style={styles.sectionHeaderTitleWrap}>
              <Text style={styles.sectionTitle} numberOfLines={2}>More filters</Text>
            </View>
            <View style={[styles.badge, styles.badgeSubscription]}>
              <Ionicons name="lock-closed" size={12} color={Colors.white} />
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
                <Ionicons name="chevron-down" size={20} color={Colors.gray600} />
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
                        <Ionicons name="close" size={24} color={Colors.gray600} />
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
                              <Ionicons name="checkmark-circle" size={22} color={Colors.friends.primary} />
                            )}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <View style={styles.languageModalFooter}>
                      <Pressable
                        onPress={() => {
                          Haptics.selectionAsync();
                          setLanguageModalVisible(false);
                        }}
                        style={[styles.languageModalDoneBtn, { backgroundColor: Colors.friends.primary }]}
                      >
                        <Text style={styles.languageModalDoneText}>Done</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                </Pressable>
              </Modal>

              <Text style={styles.label}>Interests (up to 6)</Text>
              <View style={styles.chipRowWrap}>
                {INTEREST_POPULAR_FRIENDS.map((i) => (
                  <Pressable
                    key={i}
                    onPress={() => toggleChip(interests, i, setInterests, 6)}
                    style={[styles.chipSmall, interests.includes(i) && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, interests.includes(i) && styles.chipTextSelected]}>{i}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Meetup style (up to 3)</Text>
              <View style={styles.chipRowWrap}>
                {MEETUP_GOALS_OPTIONS.map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => toggleChip(meetupGoals, g, setMeetupGoals, 3)}
                    style={[styles.chipSmall, meetupGoals.includes(g) && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, meetupGoals.includes(g) && styles.chipTextSelected]}>{g}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Pets (up to 2)</Text>
              <View style={styles.chipRowWrap}>
                {PETS_OPTIONS.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => toggleChip(pets, p, setPets, 2)}
                    style={[styles.chipSmall, pets.includes(p) && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, pets.includes(p) && styles.chipTextSelected]}>{p}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Food preferences</Text>
              <View style={styles.chipRowWrap}>
                {FOOD_OPTIONS.slice(0, 6).map((f) => (
                  <Pressable
                    key={f}
                    onPress={() => setFood(food === f ? "" : f)}
                    style={[styles.chipSmall, food === f && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, food === f && styles.chipTextSelected]}>{f}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <TouchableOpacity style={styles.upsellCard} onPress={lockSubscription} activeOpacity={0.9}>
              <Ionicons name="lock-closed" size={28} color={Colors.gray500} />
              <Text style={styles.upsellTitle}>Unlock more filters</Text>
              <Text style={styles.upsellText}>
                Filter by interests, meetup style, language, pets, food, and all Friends profile fields.
              </Text>
              <Text style={styles.upsellCta}>View subscription plans</Text>
            </TouchableOpacity>
          )}
        </View>

        <Pressable onPress={handleApply} style={styles.applyBtn} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
          <Text style={styles.applyBtnText}>Apply filters</Text>
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
      <FriendsBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundMuted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    ...Layout.topHeaderBar,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  backBtn: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonRadius,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Typography.headerTitle,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
  },
  headerRight: { width: HEADER.buttonSize, height: HEADER.buttonSize },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 20, paddingBottom: 24 },
  sectionCard: {
    marginBottom: 24,
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: 20,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  sectionCardBasic: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.accentMint,
  },
  sectionCardSubscription: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.friends.primary,
  },
  sectionHeaderRowWithBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 12,
  },
  sectionHeaderTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  badgeFree: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: Colors.friends.primary,
  },
  badgeFreeText: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: "600",
    color: Colors.white,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: Colors.friends.primary,
  },
  badgeText: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: "600",
    color: Colors.white,
  },
  badgeSubscription: {},
  sliderValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sliderValue: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  sliderMinLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 4,
  },
  slider: {
    width: "100%",
    height: Platform.OS === "ios" ? 28 : 40,
  },
  rangeSliderWrap: {
    width: "100%",
    marginTop: 4,
    height: Platform.OS === "ios" ? 28 : 40,
  },
  languageDropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: Layout.radii.control,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.backgroundLight,
    marginTop: 8,
  },
  languageDropdownText: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  languageHint: {
    ...Typography.caption,
    color: Colors.gray600,
    marginTop: 6,
    marginLeft: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  languageModalContent: {
    width: "100%",
    maxWidth: 400,
    maxHeight: "80%",
    backgroundColor: Colors.backgroundLight,
    borderRadius: Layout.radii.card,
    overflow: "hidden",
    shadowColor: Colors.softBlack,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  languageModalHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  languageModalTitle: {
    ...Typography.h3,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  languageModalSubtitle: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 8,
  },
  languageModalClose: {
    position: "absolute",
    top: 16,
    right: 16,
    padding: 4,
  },
  languageModalList: {
    maxHeight: 320,
    paddingVertical: 8,
  },
  languageModalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  languageModalRowSelectedFriends: {
    backgroundColor: Colors.friends.secondary,
  },
  languageModalRowDisabled: {
    opacity: 0.5,
  },
  languageModalRowText: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  languageModalRowTextSelectedFriends: {
    fontWeight: "600",
    color: Colors.friends.primary,
  },
  languageModalRowTextDisabled: {
    color: Colors.gray500,
  },
  languageModalFooter: {
    padding: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  languageModalDoneBtn: {
    paddingVertical: 14,
    borderRadius: Layout.radii.control,
    alignItems: "center",
  },
  languageModalDoneText: {
    ...Typography.button,
    color: Colors.white,
    fontFamily: FontFamily.heading,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  toggleLabel: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  toggleTrack: {
    width: 52,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.gray300,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleTrackOn: {
    backgroundColor: Colors.friends.primary,
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbOn: {},
  upsellCard: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  upsellTitle: {
    ...Typography.h3,
    fontSize: 16,
    marginTop: 8,
    marginBottom: 4,
    color: Colors.textPrimary,
  },
  upsellText: {
    ...Typography.caption,
    color: Colors.gray600,
    textAlign: "center",
    marginBottom: 12,
  },
  upsellCta: {
    ...Typography.button,
    fontSize: 14,
    color: Colors.friends.primary,
    fontWeight: "600",
  },
  sectionTitle: {
    ...Typography.h3,
    fontSize: 18,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
  },
  sectionHint: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 16,
    lineHeight: 20,
  },
  label: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.gray700,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },
  chipRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
  },
  chipSmall: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
  },
  chipSelected: {
    backgroundColor: Colors.friends.primary,
  },
  chipText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    fontWeight: "500",
  },
  chipTextSmall: {
    ...Typography.caption,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  chipTextSelected: {
    color: Colors.white,
  },
  applyBtn: {
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: Colors.friends.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.friends.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  applyBtnText: {
    ...Typography.button,
    fontFamily: FontFamily.heading,
    color: Colors.white,
    fontSize: 17,
  },
});

// Romance Mode – Filtering screen
// Free: distance, age, language. Subscription: interests, relationship goals, sub-profile fields. Premium: AI matching.

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
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
  ALLERGIES_OPTIONS,
  FOOD_OPTIONS,
  INTEREST_POPULAR_ROMANCE,
} from "@/constants/profileOptions";
import { useModeContext } from "@/providers/ModeContextProvider";

const DISTANCE_OPTIONS_KM = [5, 10, 25, 50, 100, 999] as const; // 999 = Any
const AGE_MIN_DEFAULT = 18;
const AGE_MAX_DEFAULT = 99;

export default function RomanceFiltersScreen() {
  const router = useRouter();
  const { context } = useModeContext();
  const HAS_SUBSCRIPTION = context.subscription_tier !== "free";
  const HAS_PREMIUM = context.subscription_tier === "premium";

  // —— Basic (free) ——
  const [distanceKm, setDistanceKm] = useState<number>(50);
  const [ageMin, setAgeMin] = useState<string>(String(AGE_MIN_DEFAULT));
  const [ageMax, setAgeMax] = useState<string>(String(AGE_MAX_DEFAULT));
  const [languages, setLanguages] = useState<string[]>(["Any"]);

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
  const [allergies, setAllergies] = useState<string[]>([]);
  const [food, setFood] = useState<string>("");

  // —— Premium ——
  const [aiMatchingEnabled, setAiMatchingEnabled] = useState(false);

  const toggleLanguage = (lang: string) => {
    Haptics.selectionAsync();
    if (lang === "Any") {
      setLanguages(["Any"]);
      return;
    }
    setLanguages((prev) => {
      const next = prev.filter((l) => l !== "Any");
      if (next.includes(lang)) return next.length ? next : ["Any"];
      return [...next, lang].length ? [...next, lang] : ["Any"];
    });
  };

  const toggleChip = (arr: string[], val: string, setter: (v: string[]) => void, max: number) => {
    Haptics.selectionAsync();
    if (arr.includes(val)) {
      setter(arr.filter((x) => x !== val));
    } else if (arr.length < max) {
      setter([...arr, val]);
    }
  };

  const handleApply = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // TODO: persist filters (context / AsyncStorage / API) and apply to discover feed
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

  const lockPremium = () => {
    Alert.alert(
      "AI-powered matching with Premium",
      "Use AI to surface better matches for you. Upgrade to Premium in Account.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "View Premium", onPress: () => router.push("/account/premium") },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
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
        {/* —— Basic (free) —— */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Basic filters</Text>
          <Text style={styles.sectionHint}>Free for everyone</Text>

          <Text style={styles.label}>Distance (max km)</Text>
          <View style={styles.chipRow}>
            {DISTANCE_OPTIONS_KM.map((km) => (
              <Pressable
                key={km}
                onPress={() => {
                  Haptics.selectionAsync();
                  setDistanceKm(km);
                }}
                style={[styles.chip, distanceKm === km && styles.chipSelected]}
              >
                <Text style={[styles.chipText, distanceKm === km && styles.chipTextSelected]}>
                  {km === 999 ? "Any" : `${km} km`}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Age range</Text>
          <View style={styles.ageRow}>
            <TextInput
              style={styles.ageInput}
              value={ageMin}
              onChangeText={setAgeMin}
              placeholder="18"
              placeholderTextColor={Colors.gray500}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.ageDash}>–</Text>
            <TextInput
              style={styles.ageInput}
              value={ageMax}
              onChangeText={setAgeMax}
              placeholder="99"
              placeholderTextColor={Colors.gray500}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>

          <Text style={styles.label}>Language</Text>
          <View style={styles.chipRowWrap}>
            {LANGUAGE_OPTIONS.slice(0, 8).map((lang) => {
              const selected = languages.includes(lang) || (languages.includes("Any") && lang === "Any");
              return (
                <Pressable
                  key={lang}
                  onPress={() => toggleLanguage(lang)}
                  style={[styles.chipSmall, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipTextSmall, selected && styles.chipTextSelected]}>{lang}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.chipRowWrap}>
            {LANGUAGE_OPTIONS.slice(8).map((lang) => {
              const selected = languages.includes(lang);
              return (
                <Pressable
                  key={lang}
                  onPress={() => toggleLanguage(lang)}
                  style={[styles.chipSmall, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipTextSmall, selected && styles.chipTextSelected]}>{lang}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* —— Subscription: more filters —— */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>More filters</Text>
            {!HAS_SUBSCRIPTION && (
              <View style={styles.badge}>
                <Ionicons name="lock-closed" size={12} color={Colors.white} />
                <Text style={styles.badgeText}>Subscription</Text>
              </View>
            )}
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
                  <Pressable
                    key={i}
                    onPress={() => toggleChip(interests, i, setInterests, 8)}
                    style={[styles.chipSmall, interests.includes(i) && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, interests.includes(i) && styles.chipTextSelected]}>{i}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Relationship goals (up to 2)</Text>
              <View style={styles.chipRowWrap}>
                {RELATIONSHIP_GOALS_OPTIONS.map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => toggleChip(relationshipGoals, g, setRelationshipGoals, 2)}
                    style={[styles.chipSmall, relationshipGoals.includes(g) && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, relationshipGoals.includes(g) && styles.chipTextSelected]}>
                      {g}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Lifestyle</Text>
              <View style={styles.chipRowWrap}>
                {LIFESTYLE_ROMANCE.map((l) => (
                  <Pressable
                    key={l}
                    onPress={() => setLifestyle(lifestyle === l ? "" : l)}
                    style={[styles.chipSmall, lifestyle === l && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, lifestyle === l && styles.chipTextSelected]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Smoking · Alcohol · Kids</Text>
              <View style={styles.chipRowWrap}>
                {SMOKING_OPTIONS.slice(0, 4).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setSmoking(smoking === s ? "" : s)}
                    style={[styles.chipSmall, smoking === s && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, smoking === s && styles.chipTextSelected]}>{s}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.chipRowWrap}>
                {ALCOHOL_OPTIONS.slice(0, 4).map((a) => (
                  <Pressable
                    key={a}
                    onPress={() => setAlcohol(alcohol === a ? "" : a)}
                    style={[styles.chipSmall, alcohol === a && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, alcohol === a && styles.chipTextSelected]}>{a}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.chipRowWrap}>
                {KIDS_OPTIONS.slice(0, 5).map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => setKids(kids === k ? "" : k)}
                    style={[styles.chipSmall, kids === k && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, kids === k && styles.chipTextSelected]}>{k}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Values (up to 3)</Text>
              <View style={styles.chipRowWrap}>
                {VALUES_OPTIONS.slice(0, 8).map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => toggleChip(values, v, setValues, 3)}
                    style={[styles.chipSmall, values.includes(v) && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, values.includes(v) && styles.chipTextSelected]}>{v}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Sexual orientation</Text>
              <View style={styles.chipRowWrap}>
                {SEXUAL_VIEWS_OPTIONS.slice(0, 5).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setSexualViews(sexualViews === s ? "" : s)}
                    style={[styles.chipSmall, sexualViews === s && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, sexualViews === s && styles.chipTextSelected]}>{s}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Religion · Politics · Food</Text>
              <View style={styles.chipRowWrap}>
                {RELIGION_OPTIONS.slice(0, 5).map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setReligion(religion === r ? "" : r)}
                    style={[styles.chipSmall, religion === r && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, religion === r && styles.chipTextSelected]}>{r}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.chipRowWrap}>
                {POLITICAL_VIEWS_OPTIONS.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setPoliticalViews(politicalViews === p ? "" : p)}
                    style={[styles.chipSmall, politicalViews === p && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, politicalViews === p && styles.chipTextSelected]}>{p}</Text>
                  </Pressable>
                ))}
              </View>
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
              <Text style={styles.label}>Allergies (up to 3)</Text>
              <View style={styles.chipRowWrap}>
                {ALLERGIES_OPTIONS.slice(0, 6).map((a) => (
                  <Pressable
                    key={a}
                    onPress={() => toggleChip(allergies, a, setAllergies, 3)}
                    style={[styles.chipSmall, allergies.includes(a) && styles.chipSelected]}
                  >
                    <Text style={[styles.chipTextSmall, allergies.includes(a) && styles.chipTextSelected]}>{a}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <TouchableOpacity style={styles.upsellCard} onPress={lockSubscription} activeOpacity={0.9}>
              <Ionicons name="lock-closed" size={28} color={Colors.gray500} />
              <Text style={styles.upsellTitle}>Unlock more filters</Text>
              <Text style={styles.upsellText}>
                Filter by interests, relationship goals, lifestyle, religion, values, and more.
              </Text>
              <Text style={styles.upsellCta}>View subscription plans</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* —— Premium: AI matching —— */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="sparkles" size={18} color={Colors.primaryViolet} style={{ marginRight: 6 }} />
            <Text style={styles.sectionTitle}>AI-powered matching</Text>
            {!HAS_PREMIUM && (
              <View style={[styles.badge, styles.badgePremium]}>
                <Ionicons name="sparkles" size={12} color={Colors.softBlack} />
                <Text style={styles.badgeTextPremium}>Premium</Text>
              </View>
            )}
          </View>
          <Text style={styles.sectionHint}>
            Use AI to surface people who fit you better. (We'll develop this feature soon.)
          </Text>

          {HAS_PREMIUM ? (
            <View style={styles.toggleRow}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12 }}>
                <Ionicons name="sparkles" size={16} color={Colors.primaryViolet} style={{ marginRight: 8 }} />
                <Text style={styles.toggleLabel}>Use AI to improve my match order</Text>
              </View>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setAiMatchingEnabled((v) => !v);
                }}
                style={[styles.toggleTrack, aiMatchingEnabled && styles.toggleTrackOn]}
              >
                <View style={[styles.toggleThumb, aiMatchingEnabled && styles.toggleThumbOn]} />
              </Pressable>
            </View>
          ) : (
            <TouchableOpacity style={styles.upsellCard} onPress={lockPremium} activeOpacity={0.9}>
              <Ionicons name="sparkles" size={28} color={Colors.primaryViolet} />
              <Text style={styles.upsellTitle}>Better matches with AI</Text>
              <Text style={styles.upsellText}>
                Premium uses AI to rank and suggest people who are a better fit for you.
              </Text>
              <Text style={styles.upsellCta}>Upgrade to Premium</Text>
            </TouchableOpacity>
          )}
        </View>

        <Pressable onPress={handleApply} style={styles.applyBtn} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
          <Text style={styles.applyBtnText}>Apply filters</Text>
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
      <RomanceBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundMuted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    minHeight: 56,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Typography.h3,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
  },
  headerRight: { width: 44 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 20, paddingBottom: 24 },
  section: { marginBottom: 28 },
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
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
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
    backgroundColor: Colors.romance.primary,
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
  ageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 18,
  },
  ageInput: {
    width: 76,
    borderWidth: 1.5,
    borderColor: Colors.gray300,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...Typography.body,
    color: Colors.textPrimary,
  },
  ageDash: {
    ...Typography.body,
    color: Colors.gray500,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: Colors.primaryViolet,
  },
  badgeText: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: "600",
    color: Colors.white,
  },
  badgePremium: {
    backgroundColor: Colors.accentYellow,
  },
  badgeTextPremium: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: "600",
    color: Colors.softBlack,
  },
  upsellCard: {
    padding: 24,
    borderRadius: Layout.radii.card,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  upsellTitle: {
    ...Typography.h3,
    fontSize: 18,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
    marginTop: 14,
    marginBottom: 8,
  },
  upsellText: {
    ...Typography.caption,
    color: Colors.gray600,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 20,
  },
  upsellCta: {
    ...Typography.button,
    fontSize: 14,
    color: Colors.romance.primary,
    fontFamily: FontFamily.heading,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  toggleLabel: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 14,
  },
  toggleTrack: {
    width: 52,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.gray300,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  toggleTrackOn: {
    backgroundColor: Colors.romance.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbOn: {
    alignSelf: "flex-end",
  },
  applyBtn: {
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: Colors.romance.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.romance.primary,
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

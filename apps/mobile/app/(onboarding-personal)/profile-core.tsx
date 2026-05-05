// apps/mobile/app/(onboarding-personal)/profile-core.tsx
// Winkly Unified Profile Setup (Final v7.0) — schema-safe for public.user_profiles
// Notes:
// - Saves ONLY to public.user_profiles (not public.users)
// - Uses upsert(id) so it works even if the row does not exist yet
// - Handles "Auth session missing" safely (redirects to Sign in)
// - Photos are UI-only for now (no storage upload yet)

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Switch,
  Animated,
  Modal,
  Pressable,
  Linking,
} from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { cacheDirectory } from "expo-file-system/legacy";
import * as Location from "expo-location";
import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import cities from "@/assets/cities.json";
import { searchCities, type CityCountry } from "@/lib/location/citySearch";
import {
  normalizeLocationDisplayString,
  formatDefaultLocationDisplay,
} from "@/lib/location/countryDisplay";
import { reverseGeocodeToDisplay } from "@/lib/location";
import { upsertOwnProfileCore } from "@/lib/access/profiles";
import { LANGUAGE_OPTIONS as PROFILE_LANGUAGE_OPTIONS } from "@/constants/profileOptions";
import { RomanceSubProfile } from "@/components/onboarding/RomanceSubProfile";
import { FriendsSubProfile } from "@/components/onboarding/FriendsSubProfile";
import { BusinessSubProfile } from "@/components/onboarding/BusinessSubProfile";
import { PhotoConfirmModal } from "@/components/media/PhotoConfirmModal";

const EDUCATION_OPTIONS = [
  "High school graduate",
  "Bachelor’s degree",
  "Master’s degree",
  "Doctorate / PhD",
  "Other",
];

const PROFILE_LANGS = PROFILE_LANGUAGE_OPTIONS.filter((l) => l !== "Any");

function sortedProfileLanguages(selected: string[]): string[] {
  const set = new Set(selected);
  const rest = PROFILE_LANGS.filter((l) => !set.has(l)).sort((a, b) => a.localeCompare(b));
  return [...selected.filter((l) => PROFILE_LANGS.includes(l)), ...rest];
}

function toISODateOnly(d: Date) {
  // yyyy-mm-dd
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ensureLength<T>(arr: T[], len: number): T[] {
  const copy = [...arr];
  while (copy.length < len) copy.push(null as T);
  return copy.slice(0, len);
}

function isAuthSessionMissing(err: any) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return msg.includes("auth session missing");
}

export default function ProfileCore() {
  const { i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEditFlow = edit === "1";
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [fadeAnim]);

  // ─────────────── CORE INFO ───────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [city, setCity] = useState("");
  const [suggestions, setSuggestions] = useState<CityCountry[]>([]);
  const [cityConfirmed, setCityConfirmed] = useState(false);
  const [locationPromptShown, setLocationPromptShown] = useState(false);
  type LocationPermissionStatus = "undetermined" | "granted" | "denied";
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<LocationPermissionStatus>("undetermined");
  const [locationLoading, setLocationLoading] = useState(false);
  const citySearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  useEffect(() => () => {
    if (citySearchTimer.current) clearTimeout(citySearchTimer.current);
  }, []);

  // Check location permission on mount and when screen is focused (e.g. returning from Settings)
  const refreshLocationPermission = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setLocationPermissionStatus(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined");
    } catch {
      setLocationPermissionStatus("undetermined");
    }
  }, []);
  useEffect(() => {
    refreshLocationPermission();
  }, [refreshLocationPermission]);
  useFocusEffect(
    useCallback(() => {
      refreshLocationPermission();
    }, [refreshLocationPermission])
  );

  const [education, setEducation] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [occupation, setOccupation] = useState("");
  const [instagram, setInstagram] = useState("");

  // ─────────────── MEDIA (UI only for now) ───────────────
  const [corePhotos, setCorePhotos] = useState<(string | null)[]>([null]); // 1 required
  const [romancePhotos, setRomancePhotos] = useState<(string | null)[]>([null, null, null]);
  const [friendsPhotos, setFriendsPhotos] = useState<(string | null)[]>([null, null, null]);
  const [businessPhotos, setBusinessPhotos] = useState<(string | null)[]>([null, null, null]);
  const [romanceVideos, setRomanceVideos] = useState<(string | null)[]>([null]);
  const [friendsVideos, setFriendsVideos] = useState<(string | null)[]>([null]);
  const [businessVideos, setBusinessVideos] = useState<(string | null)[]>([null]);

  // ─────────────── SUB-PROFILES ───────────────
  const [romanceEnabled, setRomanceEnabled] = useState(true);
  const [friendsEnabled, setFriendsEnabled] = useState(false);
  const [businessEnabled, setBusinessEnabled] = useState(false);

  const [bioRomance, setBioRomance] = useState("");
  const [bioFriends, setBioFriends] = useState("");
  const [bioBusiness, setBioBusiness] = useState("");
  const [instagramBusiness, setInstagramBusiness] = useState("");

  // Romance fields
  const [heightRomance, setHeightRomance] = useState("");
  const [weightRomance, setWeightRomance] = useState("");
  const [lifestyleRomance, setLifestyleRomance] = useState("");
  const [smokingRomance, setSmokingRomance] = useState("");
  const [alcoholRomance, setAlcoholRomance] = useState("");
  const [kidsRomance, setKidsRomance] = useState("");
  const [interestsRomance, setInterestsRomance] = useState<string[]>([]);
  const [sexualViewsRomance, setSexualViewsRomance] = useState("");
  const [relationshipGoalsRomance, setRelationshipGoalsRomance] = useState<string[]>([]);
  const [religionRomance, setReligionRomance] = useState("");
  const [politicalViewsRomance, setPoliticalViewsRomance] = useState("");
  const [valuesRomance, setValuesRomance] = useState<string[]>([]);
  const [petsRomance, setPetsRomance] = useState<string[]>([]);
  const [allergiesRomance, setAllergiesRomance] = useState<string[]>([]);
  const [foodRomance, setFoodRomance] = useState("");

  // Friends fields
  const [interestsFriends, setInterestsFriends] = useState<string[]>([]);
  const [lifestyleFriends, setLifestyleFriends] = useState("");
  const [alcoholFriends, setAlcoholFriends] = useState("");
  const [smokingFriends, setSmokingFriends] = useState("");
  const [meetupGoalsFriends, setMeetupGoalsFriends] = useState<string[]>([]);
  const [statusFriends, setStatusFriends] = useState("");
  const [kidsFriends, setKidsFriends] = useState("");
  const [petsFriends, setPetsFriends] = useState<string[]>([]);
  const [allergiesFriends, setAllergiesFriends] = useState<string[]>([]);
  const [foodFriends, setFoodFriends] = useState("");

  // Business fields
  const [roleBusiness, setRoleBusiness] = useState("");
  const [companyBusiness, setCompanyBusiness] = useState("");
  const [areaBusiness, setAreaBusiness] = useState("");
  const [networkingGoalsBusiness, setNetworkingGoalsBusiness] = useState<string[]>([]);
  const [skillsBusiness, setSkillsBusiness] = useState<string[]>([]);
  const [interestsBusiness, setInterestsBusiness] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<{ uri: string; type: "core" | "romance" | "friends" | "business"; index: number } | null>(null);

  const maxAdultDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d;
  }, []);

  // ─────────────── LOAD FROM SUPABASE + DRAFT + GPS ───────────────
  useEffect(() => {
    (async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        let loadedFromSupabase = false;

        if (!userError && userData?.user) {
          const userId = userData.user.id;

          const { data: up } = await supabase
            .from("user_profiles")
            .select("first_name, last_name, gender, birthday, city, education, occupation, languages, instagram, core_photos, main_photo_url, night_owl")
            .eq("id", userId)
            .maybeSingle();

          const upRow = up as {
            first_name?: string; last_name?: string; gender?: string; birthday?: string;
            city?: string; education?: string; occupation?: string; languages?: string[] | null;
            instagram?: string; core_photos?: string[]; main_photo_url?: string;
            night_owl?: boolean | null;
          } | null;

          if (upRow?.first_name || upRow?.last_name) {
            loadedFromSupabase = true;
            setFirstName(upRow.first_name ?? "");
            setLastName(upRow.last_name ?? "");
            setGender(upRow.gender ?? "");
            setBirthday(upRow.birthday ? new Date(upRow.birthday) : null);
            const dbCity = upRow.city ?? "";
            setCity(dbCity ? normalizeLocationDisplayString(String(dbCity), appLanguage) : "");
            if (dbCity) setCityConfirmed(true);
            setEducation(upRow.education ?? "");
            setLanguages(Array.isArray(upRow.languages) ? upRow.languages : []);
            setOccupation(upRow.occupation ?? "");
            setInstagram(upRow.instagram ?? "");
            const photos = Array.isArray(upRow.core_photos) && upRow.core_photos.length > 0
              ? upRow.core_photos
              : upRow.main_photo_url
                ? [upRow.main_photo_url]
                : [null];
            setCorePhotos(photos.length ? photos : [null]);
          }

          const { data: subs } = await supabase
            .from("sub_profiles")
            .select("mode, bio, photos, interests, meta")
            .eq("user_id", userId);

          (subs ?? []).forEach((row: { mode: string; bio?: string | null; photos?: string[] | null; interests?: string[] | null; meta?: Record<string, unknown> | null }) => {
            const meta = row.meta ?? {};
            if (row.mode === "romance") {
              loadedFromSupabase = true;
              setRomanceEnabled(true);
              setBioRomance(row.bio ?? "");
              setRomancePhotos(Array.isArray(row.photos) && row.photos.length > 0 ? ensureLength(row.photos, 3) : [null, null, null]);
              setInterestsRomance(Array.isArray(row.interests) ? row.interests : []);
              setHeightRomance(String(meta.height ?? ""));
              setWeightRomance(String(meta.weight ?? ""));
              setLifestyleRomance(String(meta.lifestyle ?? ""));
              setSmokingRomance(String(meta.smoking ?? ""));
              setAlcoholRomance(String(meta.alcohol ?? ""));
              setKidsRomance(String(meta.kids ?? ""));
              setSexualViewsRomance(String(meta.sexual_views ?? ""));
              setRelationshipGoalsRomance(Array.isArray(meta.relationship_goals) ? meta.relationship_goals : []);
              setReligionRomance(String(meta.religion ?? ""));
              setPoliticalViewsRomance(String(meta.political_views ?? ""));
              setValuesRomance(Array.isArray(meta.values) ? meta.values : []);
              setPetsRomance(Array.isArray(meta.pets) ? meta.pets : []);
              setAllergiesRomance(Array.isArray(meta.allergies) ? meta.allergies : meta.allergies ? [String(meta.allergies)] : []);
              setFoodRomance(String(meta.food ?? ""));
              setRomanceVideos(Array.isArray(meta.videos) ? ensureLength(meta.videos, 1) : [null]);
            }
            if (row.mode === "friends") {
              loadedFromSupabase = true;
              setFriendsEnabled(true);
              setBioFriends(row.bio ?? "");
              setFriendsPhotos(Array.isArray(row.photos) && row.photos.length > 0 ? ensureLength(row.photos, 3) : [null, null, null]);
              setInterestsFriends(Array.isArray(row.interests) ? row.interests : []);
              setLifestyleFriends(String(meta.lifestyle ?? ""));
              setAlcoholFriends(String(meta.alcohol ?? ""));
              setSmokingFriends(String(meta.smoking ?? ""));
              setMeetupGoalsFriends(Array.isArray(meta.meetup_goals) ? meta.meetup_goals : []);
              setStatusFriends(String(meta.status ?? ""));
              setKidsFriends(String(meta.kids ?? ""));
              setPetsFriends(Array.isArray(meta.pets) ? meta.pets : []);
              setAllergiesFriends(Array.isArray(meta.allergies) ? meta.allergies : meta.allergies ? [String(meta.allergies)] : []);
              setFoodFriends(String(meta.food ?? ""));
              setFriendsVideos(Array.isArray(meta.videos) ? ensureLength(meta.videos, 1) : [null]);
            }
            if (row.mode === "business") {
              loadedFromSupabase = true;
              setBusinessEnabled(true);
              setBioBusiness(row.bio ?? "");
              setBusinessPhotos(Array.isArray(row.photos) && row.photos.length > 0 ? ensureLength(row.photos, 3) : [null, null, null]);
              setInterestsBusiness(Array.isArray(row.interests) ? row.interests : []);
              setRoleBusiness(String(meta.role ?? ""));
              setCompanyBusiness(String(meta.company ?? ""));
              setAreaBusiness(String(meta.area ?? ""));
              setNetworkingGoalsBusiness(
                Array.isArray(meta.networking_goals)
                  ? meta.networking_goals
                  : typeof meta.networking_goals === "string" && (meta.networking_goals as string).trim()
                    ? [(meta.networking_goals as string).trim()]
                    : []
              );
              setSkillsBusiness(
                Array.isArray(meta.skills) ? meta.skills : typeof meta.skills === "string" && (meta.skills as string).trim() ? [(meta.skills as string).trim()] : []
              );
              setInstagramBusiness(String(meta.instagram ?? ""));
              setBusinessVideos(Array.isArray(meta.videos) ? ensureLength(meta.videos, 1) : [null]);
            }
          });
        }

        if (!loadedFromSupabase) {
          const draft = await AsyncStorage.getItem("winkly_profile_draft");
          if (draft) {
            const data = JSON.parse(draft);
            setFirstName(data.firstName ?? "");
            setLastName(data.lastName ?? "");
            setGender(data.gender ?? "");
            setBirthday(data.birthday ? new Date(data.birthday) : null);
            const draftCity = data.city ?? "";
            setCity(draftCity ? normalizeLocationDisplayString(String(draftCity), appLanguage) : "");
            if (draftCity) setCityConfirmed(true);
            setEducation(data.education ?? "");
            setLanguages(data.languages ?? []);
            setOccupation(data.occupation ?? "");
            setInstagram(data.instagram ?? "");
            setBioRomance(data.bioRomance ?? "");
            setBioFriends(data.bioFriends ?? "");
            setBioBusiness(data.bioBusiness ?? "");
            setInstagramBusiness(data.instagramBusiness ?? "");
            setRomanceEnabled(data.romanceEnabled ?? true);
            setFriendsEnabled(data.friendsEnabled ?? false);
            setBusinessEnabled(data.businessEnabled ?? false);
            setHeightRomance(data.heightRomance ?? "");
            setWeightRomance(data.weightRomance ?? "");
            setLifestyleRomance(data.lifestyleRomance ?? "");
            setSmokingRomance(data.smokingRomance ?? "");
            setAlcoholRomance(data.alcoholRomance ?? "");
            setKidsRomance(data.kidsRomance ?? "");
            setInterestsRomance(data.interestsRomance ?? []);
            setSexualViewsRomance(data.sexualViewsRomance ?? "");
            setRelationshipGoalsRomance(data.relationshipGoalsRomance ?? []);
            setReligionRomance(data.religionRomance ?? "");
            setPoliticalViewsRomance(data.politicalViewsRomance ?? "");
            setValuesRomance(data.valuesRomance ?? []);
            setPetsRomance(data.petsRomance ?? []);
            setAllergiesRomance(Array.isArray(data.allergiesRomance) ? data.allergiesRomance : (data.allergiesRomance ? [data.allergiesRomance] : []));
            setFoodRomance(data.foodRomance ?? "");
            setInterestsFriends(data.interestsFriends ?? []);
            setLifestyleFriends(data.lifestyleFriends ?? "");
            setAlcoholFriends(data.alcoholFriends ?? "");
            setSmokingFriends(data.smokingFriends ?? "");
            setMeetupGoalsFriends(data.meetupGoalsFriends ?? []);
            setStatusFriends(data.statusFriends ?? "");
            setKidsFriends(data.kidsFriends ?? "");
            setPetsFriends(data.petsFriends ?? []);
            setAllergiesFriends(Array.isArray(data.allergiesFriends) ? data.allergiesFriends : (data.allergiesFriends ? [data.allergiesFriends] : []));
            setFoodFriends(data.foodFriends ?? "");
            setRoleBusiness(data.roleBusiness ?? "");
            setCompanyBusiness(data.companyBusiness ?? "");
            setAreaBusiness(data.areaBusiness ?? "");
            setNetworkingGoalsBusiness(Array.isArray(data.networkingGoalsBusiness) ? data.networkingGoalsBusiness : []);
            setSkillsBusiness(Array.isArray(data.skillsBusiness) ? data.skillsBusiness : []);
            setInterestsBusiness(data.interestsBusiness ?? []);

            setCorePhotos(data.corePhotos ?? [null]);
            setRomancePhotos(data.romancePhotos ?? [null, null, null]);
            setFriendsPhotos(data.friendsPhotos ?? [null, null, null]);
            setBusinessPhotos(ensureLength(data.businessPhotos ?? [null, null, null], 3));
            setRomanceVideos(ensureLength(data.romanceVideos ?? [null], 1));
            setFriendsVideos(ensureLength(data.friendsVideos ?? [null], 1));
            setBusinessVideos(ensureLength(data.businessVideos ?? [null], 1));
          }
        }

        // Location prompt is shown when user taps "Use my location" near city field
      } catch (e) {
        console.warn("Profile draft/location init warning:", e);
      }
    })();
  }, [appLanguage]);

  // ─────────────── AUTO-SAVE DRAFT ───────────────
  const autoSave = useCallback(async () => {
    const data = {
      firstName,
      lastName,
      gender,
      birthday: birthday ? birthday.toISOString() : null,
      city,
      education,
      languages,
      occupation,
      instagram,
      bioRomance,
      bioFriends,
      bioBusiness,
      instagramBusiness,
      romanceEnabled,
      friendsEnabled,
      businessEnabled,
      heightRomance,
      weightRomance,
      lifestyleRomance,
      smokingRomance,
      alcoholRomance,
      kidsRomance,
      interestsRomance,
      sexualViewsRomance,
      relationshipGoalsRomance,
      religionRomance,
      politicalViewsRomance,
      valuesRomance,
      petsRomance,
      allergiesRomance,
      foodRomance,
      interestsFriends,
      lifestyleFriends,
      alcoholFriends,
      smokingFriends,
      meetupGoalsFriends,
      statusFriends,
      kidsFriends,
      petsFriends,
      allergiesFriends,
      foodFriends,
      roleBusiness,
      companyBusiness,
      areaBusiness,
      networkingGoalsBusiness,
      skillsBusiness,
      interestsBusiness,
      corePhotos,
      romancePhotos,
      friendsPhotos,
      businessPhotos,
      romanceVideos,
      friendsVideos,
      businessVideos,
    };
    try {
      await AsyncStorage.setItem("winkly_profile_draft", JSON.stringify(data));
    } catch (e) {
      // ignore draft save issues
      console.warn("Draft autosave warning:", e);
    }
  }, [
    firstName,
    lastName,
    gender,
    birthday,
    city,
    education,
    languages,
    occupation,
    instagram,
    bioRomance,
    bioFriends,
    bioBusiness,
    instagramBusiness,
    romanceEnabled,
    friendsEnabled,
    businessEnabled,
    heightRomance,
    weightRomance,
    lifestyleRomance,
    smokingRomance,
    alcoholRomance,
    kidsRomance,
    interestsRomance,
    sexualViewsRomance,
    relationshipGoalsRomance,
    religionRomance,
      politicalViewsRomance,
      valuesRomance,
      petsRomance,
      allergiesRomance,
      foodRomance,
      interestsFriends,
    lifestyleFriends,
    alcoholFriends,
    smokingFriends,
    meetupGoalsFriends,
      statusFriends,
      kidsFriends,
      petsFriends,
      allergiesFriends,
      foodFriends,
      roleBusiness,
    companyBusiness,
    areaBusiness,
    networkingGoalsBusiness,
    skillsBusiness,
    interestsBusiness,
    corePhotos,
    romancePhotos,
    friendsPhotos,
    businessPhotos,
    romanceVideos,
    friendsVideos,
    businessVideos,
  ]);

  useEffect(() => {
    const timeout = setTimeout(() => autoSave(), 900);
    return () => clearTimeout(timeout);
  }, [autoSave]);

  const saveToSupabase = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data?.user?.id || !firstName || !lastName) return;
    const cityNorm = city.trim() ? normalizeLocationDisplayString(city.trim(), appLanguage) : null;
    try {
      await supabase.from("user_profiles").upsert({
        id: data.user.id,
        first_name: firstName,
        last_name: lastName,
        gender: gender || null,
        birthday: birthday ? toISODateOnly(birthday) : null,
        city: cityNorm,
        education: education || null,
        occupation: occupation || null,
        languages: languages.length ? languages : null,
        instagram: instagram.trim() || null,
        core_photos: corePhotos.filter(Boolean) as string[],
        main_photo_url: corePhotos[0] || null,
      }, { onConflict: "id" });
      await upsertOwnProfileCore(data.user.id, {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        city: cityNorm,
      });
    } catch (e) {
      console.warn("Auto-save to Supabase:", e);
    }
  }, [firstName, lastName, gender, birthday, city, education, occupation, languages, instagram, corePhotos, appLanguage]);

  useEffect(() => {
    if (!firstName && !lastName) return;
    const t = setTimeout(saveToSupabase, 2000);
    return () => clearTimeout(t);
  }, [saveToSupabase, firstName, lastName]);

  // ─────────────── CITY AUTOCOMPLETE (Nominatim + static fallback) ───────────────
  const onCityChange = useCallback((text: string) => {
    setCity(text);
    setCityConfirmed(false);

    const q = text.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }

    if (citySearchTimer.current) clearTimeout(citySearchTimer.current);
    citySearchTimer.current = setTimeout(async () => {
      const fromApi = await searchCities(q, appLanguage);
      if (fromApi.length > 0) {
        setSuggestions(fromApi);
        return;
      }
      const fromJson = (cities as any[])
        .filter((c: any) => String(c.city).toLowerCase().startsWith(q.toLowerCase()))
        .slice(0, 10)
        .map((c: any) => ({ city: c.city, country: c.country || "" }));
      setSuggestions(fromJson);
    }, 400);
  }, [appLanguage]);

  const selectCity = useCallback((c: CityCountry) => {
    setCity(formatDefaultLocationDisplay(c.city, c.country, appLanguage));
    setSuggestions([]);
    setCityConfirmed(true);
  }, [appLanguage]);

  /** Same pipeline as Concierge / device location: trust reverse-geocode, full country name; static list only as fallback. */
  const applyLocationToCity = useCallback(
    async (latitude: number, longitude: number) => {
      try {
        const result = await reverseGeocodeToDisplay(latitude, longitude, appLanguage);
        if (result.ok && result.display) {
          setCity(result.display);
          setCityConfirmed(true);
          setSuggestions([]);
          return;
        }
      } catch (e) {
        console.warn("reverseGeocodeToDisplay:", e);
      }
      try {
        const nearby = (cities as any[])
          .map((c: any) => ({ ...c, dist: Math.hypot((c.lat ?? 0) - latitude, (c.lng ?? 0) - longitude) }))
          .sort((a: any, b: any) => a.dist - b.dist)
          .slice(0, 1);
        if (nearby.length > 0) {
          setCity(
            formatDefaultLocationDisplay(
              String(nearby[0].city),
              String(nearby[0].country ?? ""),
              appLanguage
            )
          );
        }
      } catch {
        /* ignore */
      }
      setCityConfirmed(true);
      setSuggestions([]);
    },
    [appLanguage]
  );

  const requestLocationForCity = useCallback(() => {
    (async () => {
      try {
        const { status: existing } = await Location.getForegroundPermissionsAsync();
        setLocationPermissionStatus(existing === "granted" ? "granted" : existing === "denied" ? "denied" : "undetermined");

        if (existing === "denied") {
          Alert.alert(
            "Location access",
            "To set your city from GPS, enable location access for Winkly in your device settings.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Open settings", onPress: () => Linking.openSettings() },
            ]
          );
          return;
        }

        if (existing === "granted") {
          setLocationLoading(true);
          try {
            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
              mayShowUserSettingsDialog: true,
            });
            const { latitude, longitude } = pos.coords;
            await applyLocationToCity(latitude, longitude);
          } finally {
            setLocationLoading(false);
          }
          return;
        }

        // undetermined: ask once
        if (locationPromptShown) return;
        setLocationPromptShown(true);
        Alert.alert(
          "Use your location?",
          "Winkly can use your location to suggest your city for better recommendations and nearby matches.",
          [
            { text: "Not now", style: "cancel" },
            {
              text: "Allow",
              onPress: async () => {
                try {
                  const { status } = await Location.requestForegroundPermissionsAsync();
                  setLocationPermissionStatus(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined");
                  if (status === "granted") {
                    setLocationLoading(true);
                    try {
                      const pos = await Location.getCurrentPositionAsync({
                        accuracy: Location.Accuracy.High,
                        mayShowUserSettingsDialog: true,
                      });
                      const { latitude, longitude } = pos.coords;
                      await applyLocationToCity(latitude, longitude);
                    } finally {
                      setLocationLoading(false);
                    }
                  }
                } catch (e) {
                  console.warn("Location for city:", e);
                  setLocationLoading(false);
                }
              },
            },
          ]
        );
      } catch (e) {
        console.warn("Location for city:", e);
        setLocationLoading(false);
      }
    })();
  }, [locationPromptShown, applyLocationToCity]);

  const toggleMulti = (arr: string[], val: string, setter: (v: string[]) => void, max: number) => {
    const has = arr.includes(val);
    if (has) setter(arr.filter((x) => x !== val));
    else if (arr.length < max) setter([...arr, val]);
  };

  const allergiesToggleRomance = (v: string) => {
    if (v === "None") {
      setAllergiesRomance((prev) => (prev.includes("None") ? [] : ["None"]));
    } else {
      setAllergiesRomance((prev) => {
        const next = prev.filter((x) => x !== "None");
        if (next.includes(v)) return next.filter((x) => x !== v);
        if (next.length >= 3) return next;
        return [...next, v];
      });
    }
  };

  const allergiesToggleFriends = (v: string) => {
    if (v === "None") {
      setAllergiesFriends((prev) => (prev.includes("None") ? [] : ["None"]));
    } else {
      setAllergiesFriends((prev) => {
        const next = prev.filter((x) => x !== "None");
        if (next.includes(v)) return next.filter((x) => x !== v);
        if (next.length >= 3) return next;
        return [...next, v];
      });
    }
  };

  const petsToggleRomance = (v: string) => {
    if (v === "No pets") {
      setPetsRomance((prev) => (prev.includes("No pets") ? [] : ["No pets"]));
    } else {
      setPetsRomance((prev) => {
        const next = prev.filter((x) => x !== "No pets");
        if (next.includes(v)) return next.filter((x) => x !== v);
        if (next.length >= 2) return next;
        return [...next, v];
      });
    }
  };

  const petsToggleFriends = (v: string) => {
    if (v === "No pets") {
      setPetsFriends((prev) => (prev.includes("No pets") ? [] : ["No pets"]));
    } else {
      setPetsFriends((prev) => {
        const next = prev.filter((x) => x !== "No pets");
        if (next.includes(v)) return next.filter((x) => x !== v);
        if (next.length >= 2) return next;
        return [...next, v];
      });
    }
  };

  // ─────────────── PHOTO PICKER (preview → crop → save) ───────────────
  const pickImage = async (
    type: "core" | "romance" | "friends" | "business",
    index: number
  ) => {
    Haptics.selectionAsync();
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow photo access to upload your pictures.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) return;

    let uri = result.assets[0].uri;
    if (!uri.startsWith("http")) {
      try {
        const ext = uri.toLowerCase().includes(".png") ? "png" : "jpg";
        const dest = `${cacheDirectory ?? ""}winkly_photo_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        uri = dest.startsWith("file://") ? dest : `file://${dest}`;
      } catch {
        // use original URI
      }
    }

    setPendingCrop({ uri, type, index });
    setCropModalVisible(true);
  };

  const onCropSave = (uri: string) => {
    if (!pendingCrop) return;
    const { type, index } = pendingCrop;
    if (type === "core") {
      const updated = [...corePhotos];
      updated[index] = uri;
      setCorePhotos(updated);
    } else if (type === "romance") {
      const updated = [...romancePhotos];
      updated[index] = uri;
      setRomancePhotos(updated);
    } else if (type === "friends") {
      const updated = [...friendsPhotos];
      updated[index] = uri;
      setFriendsPhotos(updated);
    } else {
      const updated = [...businessPhotos];
      updated[index] = uri;
      setBusinessPhotos(updated);
    }
    setCropModalVisible(false);
    setPendingCrop(null);
  };

  const MAX_VIDEO_SEC = 10;
  const pickVideo = async (type: "romance" | "friends" | "business") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow photo access to pick videos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      videoMaxDuration: MAX_VIDEO_SEC,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const durationMs = asset.duration ?? 0;
    if (durationMs > MAX_VIDEO_SEC * 1000) {
      Alert.alert("Too long", `Video must be ${MAX_VIDEO_SEC} seconds or shorter.`);
      return;
    }
    let uri = asset.uri;
    if (!uri.startsWith("http")) {
      try {
        const dest = `${cacheDirectory ?? ""}winkly_video_${Date.now()}.mp4`;
        await FileSystem.copyAsync({ from: uri, to: dest });
        uri = dest;
      } catch { /* use original */ }
    }
    if (type === "romance") setRomanceVideos([uri]);
    else if (type === "friends") setFriendsVideos([uri]);
    else setBusinessVideos([uri]);
  };

  // ─────────────── SAVE TO SUPABASE ───────────────
  const handleContinue = async () => {
    if (!firstName || !lastName || !gender || !birthday || !city) {
      Alert.alert("Incomplete", "Please fill in all required fields.");
      return;
    }

    if (!corePhotos[0]) {
      Alert.alert("Photo required", "Please add at least 1 profile photo.");
      return;
    }

    try {
      setSaving(true);

      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        if (isAuthSessionMissing(userErr)) {
          Alert.alert(
            "Session missing",
            "Please sign in again so Winkly can securely continue.",
            [{ text: "Go to Sign in", onPress: () => router.replace("/(auth)/signin") }]
          );
          return;
        }
        throw userErr;
      }

      const authUser = data?.user;
      if (!authUser?.id) {
        Alert.alert(
          "Session expired",
          "Please sign in again to continue.",
          [{ text: "Go to Sign in", onPress: () => router.replace("/(auth)/signin") }]
        );
        return;
      }

      const cityNorm = normalizeLocationDisplayString(city.trim(), appLanguage);

      const payload: Record<string, any> = {
        id: authUser.id,
        first_name: firstName,
        last_name: lastName,
        gender,
        birthday: toISODateOnly(birthday),
        city: cityNorm,
        education: education || null,
        occupation: occupation || null,
        languages: languages.length ? languages : null,
        instagram: instagram.trim() || null,
        core_photos: corePhotos.filter(Boolean) as string[],
        main_photo_url: corePhotos[0] || null,
      };

      const { error: upsertErr } = await supabase
        .from("user_profiles")
        .upsert(payload, { onConflict: "id" });

      if (upsertErr) throw upsertErr;

      const { error: coreErr } = await upsertOwnProfileCore(authUser.id, {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        city: cityNorm,
      });
      if (coreErr) throw coreErr;

      if (romanceEnabled) {
        const romanceMeta: Record<string, unknown> = {
          height: heightRomance.trim() || null,
          weight: weightRomance.trim() || null,
          lifestyle: lifestyleRomance || null,
          smoking: smokingRomance || null,
          alcohol: alcoholRomance || null,
          kids: kidsRomance || null,
          sexual_views: sexualViewsRomance || null,
          relationship_goals: relationshipGoalsRomance,
          religion: religionRomance || null,
          political_views: politicalViewsRomance || null,
          values: valuesRomance,
          pets: petsRomance,
          allergies: allergiesRomance.length ? allergiesRomance : null,
          food: foodRomance || null,
          videos: romanceVideos.filter(Boolean),
        };
        const romancePayload = {
          user_id: authUser.id,
          mode: "romance",
          bio: bioRomance || null,
          photos: romancePhotos.filter(Boolean) as string[],
          interests: interestsRomance.length ? interestsRomance : null,
          meta: romanceMeta,
        };
        await supabase.from("sub_profiles").upsert(romancePayload, { onConflict: "user_id,mode" });
        await supabase.from("profiles_mode").upsert(
          { ...romancePayload, updated_at: new Date().toISOString() },
          { onConflict: "user_id,mode" }
        );
      }
      if (friendsEnabled) {
        const friendsMeta: Record<string, unknown> = {
          lifestyle: lifestyleFriends || null,
          alcohol: alcoholFriends || null,
          smoking: smokingFriends || null,
          meetup_goals: meetupGoalsFriends,
          status: statusFriends || null,
          kids: kidsFriends || null,
          pets: petsFriends,
          allergies: allergiesFriends.length ? allergiesFriends : null,
          food: foodFriends || null,
          videos: friendsVideos.filter(Boolean),
        };
        const friendsPayload = {
          user_id: authUser.id,
          mode: "friends",
          bio: bioFriends || null,
          photos: friendsPhotos.filter(Boolean) as string[],
          interests: interestsFriends.length ? interestsFriends : null,
          meta: friendsMeta,
        };
        await supabase.from("sub_profiles").upsert(friendsPayload, { onConflict: "user_id,mode" });
        await supabase.from("profiles_mode").upsert(
          { ...friendsPayload, updated_at: new Date().toISOString() },
          { onConflict: "user_id,mode" }
        );
      }
      if (businessEnabled) {
        const businessMeta: Record<string, unknown> = {
          role: roleBusiness.trim() || null,
          company: companyBusiness.trim() || null,
          area: areaBusiness.trim() || null,
          networking_goals: networkingGoalsBusiness.length ? networkingGoalsBusiness : null,
          skills: skillsBusiness.length ? skillsBusiness : null,
          interests: interestsBusiness,
          instagram: instagramBusiness.trim() || null,
          videos: businessVideos.filter(Boolean),
        };
        const businessPayload = {
          user_id: authUser.id,
          mode: "business",
          bio: bioBusiness || null,
          photos: businessPhotos.filter(Boolean) as string[],
          interests: interestsBusiness.length ? interestsBusiness : null,
          meta: businessMeta,
        };
        await supabase.from("sub_profiles").upsert(businessPayload, { onConflict: "user_id,mode" });
        await supabase.from("profiles_mode").upsert(
          { ...businessPayload, updated_at: new Date().toISOString() },
          { onConflict: "user_id,mode" }
        );
      }

      await AsyncStorage.removeItem("winkly_profile_draft");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (isEditFlow) {
        router.back();
        return;
      }
      const skipWinklyWorld = await import("@/lib/introFlags").then((m) => m.shouldSkipWinklyWorld());
      if (skipWinklyWorld) {
        router.push("/(onboarding-personal)/mode-selection");
      } else {
        router.push("/(onboarding-personal)/winkly-world?variant=personal");
      }
    } catch (err: any) {
      Alert.alert(
        "Save failed",
        err?.message ?? "Something went wrong while saving your profile. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const coreProgress = useMemo(() => {
    const has = [!!corePhotos[0], !!firstName.trim(), !!lastName.trim(), !!birthday, !!gender.trim(), !!city.trim()].filter(Boolean).length;
    return Math.round((has / 6) * 100);
  }, [corePhotos[0], firstName, lastName, birthday, gender, city]);

  const overallProgress = useMemo(() => {
    let total = 0;
    let max = 6;
    const coreHas = [!!corePhotos[0], !!firstName.trim(), !!lastName.trim(), !!birthday, !!gender.trim(), !!city.trim()].filter(Boolean).length;
    total += coreHas;
    if (romanceEnabled) {
      max += 3;
      total += [!!bioRomance.trim(), romancePhotos.some(Boolean), interestsRomance.length > 0].filter(Boolean).length;
    }
    if (friendsEnabled) {
      max += 3;
      total += [!!bioFriends.trim(), friendsPhotos.some(Boolean), interestsFriends.length > 0].filter(Boolean).length;
    }
    if (businessEnabled) {
      max += 3;
      total += [!!bioBusiness.trim(), businessPhotos.some(Boolean), networkingGoalsBusiness.length > 0].filter(Boolean).length;
    }
    return Math.round((total / max) * 100);
  }, [
    corePhotos[0], firstName, lastName, birthday, gender, city,
    romanceEnabled, bioRomance, romancePhotos, interestsRomance,
    friendsEnabled, bioFriends, friendsPhotos, interestsFriends,
    businessEnabled, bioBusiness, businessPhotos, networkingGoalsBusiness,
  ]);

  const inputBase = {
    borderWidth: 2,
    borderColor: Colors.gray200,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: Colors.white,
    color: Colors.textPrimary,
    fontSize: 16,
    minHeight: Layout.touchTargetMin,
  };
  const inputFocused = { borderColor: Colors.primaryViolet, ...Shadow.card };

  // ─────────────── UI ───────────────
  return (
    <SafeScreenView style={{ flex: 1, backgroundColor: Colors.backgroundMuted }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray200, shadowColor: "#1C1C1E", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 }}>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); router.back(); }}
            style={headerBtn}
            activeOpacity={0.9}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ ...Typography.h3, color: Colors.textPrimary, fontFamily: FontFamily.heading }}>Your Profile</Text>
          </View>
          <TouchableOpacity
            onPress={async () => {
              Haptics.selectionAsync();
              await autoSave();
              router.push("/profile/preview");
            }}
            style={headerBtn}
            activeOpacity={0.9}
            accessibilityLabel="Preview how your card looks to others"
          >
            <Ionicons name="eye-outline" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 24, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {/* Progress — matches mode selection formula (bio, photos, interests per sub-profile) */}
            <View style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ ...Typography.body, color: Colors.gray700 }}>Profile completion</Text>
                <Text style={{ ...Typography.button, color: Colors.primaryViolet }}>{overallProgress}%</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: Colors.gray200, overflow: "hidden" }}>
                <View style={{ height: "100%", width: `${overallProgress}%`, backgroundColor: Colors.primaryViolet, borderRadius: 3 }} />
              </View>
            </View>

            {/* Section: About You */}
            <View style={[sectionCard, { marginBottom: 20 }]}>
              <Text style={{ ...Typography.h3, color: Colors.textPrimary, marginBottom: 16, fontFamily: FontFamily.heading }}>About you 💫</Text>

              <Text style={label}>Profile photo <Text style={requiredMark}>*</Text></Text>
              <View style={{ flexDirection: "row", marginBottom: 18 }}>
                <TouchableOpacity
                  onPress={() => pickImage("core", 0)}
                  style={corePhotos[0] ? photoSlotFilled : photoSlotEmpty}
                >
                  {corePhotos[0] ? (
                    <Image source={{ uri: corePhotos[0] }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={32} color={Colors.gray400} />
                      <Text style={{ ...Typography.caption, color: Colors.gray500, marginTop: 6 }}>Add photo</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={{ flex: 1, paddingLeft: 16, justifyContent: "center" }}>
                  <Text style={{ ...Typography.body, color: Colors.textPrimary }}>
                    Add a clear photo of yourself.
                  </Text>
                  <Text style={{ ...Typography.caption, color: Colors.gray600, marginTop: 6 }}>
                    This photo is used in Events mode and shown on your event cards.
                  </Text>
                </View>
              </View>

              <Text style={label}>First name <Text style={requiredMark}>*</Text></Text>
              <TextInput
                placeholder="First name"
                placeholderTextColor={Colors.gray500}
                value={firstName}
                onChangeText={setFirstName}
                onFocus={() => setFocusedField("firstName")}
                onBlur={() => setFocusedField(null)}
                style={[inputBase, focusedField === "firstName" && inputFocused]}
              />
              <Text style={label}>Last name <Text style={requiredMark}>*</Text></Text>
              <TextInput
                placeholder="Last name"
                placeholderTextColor={Colors.gray500}
                value={lastName}
                onChangeText={setLastName}
                onFocus={() => setFocusedField("lastName")}
                onBlur={() => setFocusedField(null)}
                style={[inputBase, focusedField === "lastName" && inputFocused]}
              />

              <Text style={label}>Birth date <Text style={requiredMark}>*</Text></Text>
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync(); setShowDatePicker(true); }}
                style={[inputBase, { justifyContent: "center" }]}
              >
                <Text style={{ ...Typography.body, color: birthday ? Colors.textPrimary : Colors.gray400 }}>
                  {birthday
                    ? `${birthday.getDate()}.${birthday.getMonth() + 1}.${birthday.getFullYear()}`
                    : "Select your birth date"}
                </Text>
              </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={birthday || new Date(2000, 0, 1)}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, date) => {
              setShowDatePicker(false);
              if (date) setBirthday(date);
            }}
            maximumDate={maxAdultDate}
          />
        )}

        <Text style={{ ...Typography.caption, color: Colors.gray500, marginBottom: 16 }}>
          Your birthday will remain private — only your age will be visible.
        </Text>

        <Text style={[label, { marginBottom: 8 }]}>Gender <Text style={requiredMark}>*</Text></Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
          {["Female", "Male", "Other"].map((g) => (
            <TouchableOpacity
              key={g}
              onPress={() => { Haptics.selectionAsync(); setGender(g); }}
              style={{
                flex: 1,
                marginHorizontal: 4,
                backgroundColor: gender === g ? Colors.primaryViolet : Colors.white,
                borderWidth: 2,
                borderColor: gender === g ? Colors.primaryViolet : Colors.gray200,
                borderRadius: Layout.radii.control,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ ...Typography.body, color: gender === g ? "#FFF" : Colors.textPrimary }}>
                {g}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={[label, { marginBottom: 0 }]}>City <Text style={requiredMark}>*</Text></Text>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); requestLocationForCity(); }}
            disabled={locationLoading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 16,
              backgroundColor: locationPermissionStatus === "granted" ? Colors.primaryViolet + "15" : Colors.gray200 + "80",
              shadowColor: locationPermissionStatus === "granted" ? Colors.primaryViolet : "transparent",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: locationPermissionStatus === "granted" ? 0.15 : 0,
              shadowRadius: 4,
              elevation: locationPermissionStatus === "granted" ? 3 : 0,
              opacity: locationLoading ? 0.7 : 1,
            }}
          >
            {locationLoading ? (
              <Text style={{ ...Typography.caption, fontWeight: "600", color: Colors.gray600, marginRight: 6 }}>Getting location…</Text>
            ) : (
              <>
                <Ionicons name="locate" size={16} color={locationPermissionStatus === "granted" ? Colors.primaryViolet : Colors.gray500} style={{ marginRight: 6 }} />
                <Text style={{ ...Typography.caption, fontWeight: "600", color: locationPermissionStatus === "granted" ? Colors.primaryViolet : Colors.gray600 }}>
                  {locationPermissionStatus === "denied" ? "Enable location" : "Use my location"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <TextInput
          placeholder="e.g. Berlin, London"
          placeholderTextColor={Colors.gray500}
          value={city}
          onChangeText={onCityChange}
          onFocus={() => setFocusedField("city")}
          onBlur={() => setFocusedField(null)}
          style={[inputBase, focusedField === "city" && inputFocused]}
        />

        {suggestions.length > 0 && !cityConfirmed && (
          <View style={[suggestionList, { ...Shadow.card }]}>
            {suggestions.map((item) => (
              <TouchableOpacity
                key={`${item.city}-${item.country}`}
                onPress={() => { Haptics.selectionAsync(); selectCity(item); }}
                style={suggestionItem}
              >
                <Text style={{ color: Colors.textPrimary }}>
                  {formatDefaultLocationDisplay(item.city, item.country, appLanguage)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
          </View>

          {/* Section: More about you */}
          <View style={[sectionCard, { marginBottom: 20 }]}>
            <Text style={{ ...Typography.h3, color: Colors.textPrimary, marginBottom: 16, fontFamily: FontFamily.heading }}>More about you</Text>

        <Text style={label}>Education</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ marginBottom: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {EDUCATION_OPTIONS.map((e) => (
            <TouchableOpacity
              key={e}
              onPress={() => { Haptics.selectionAsync(); setEducation(e); }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 20,
                marginRight: 8,
                backgroundColor: education === e ? Colors.primaryViolet : Colors.gray100,
              }}
            >
              <Text style={{ ...Typography.caption, color: education === e ? "#FFF" : Colors.textPrimary }}>
                {e}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={label}>Occupation</Text>
        <TextInput
          placeholder="What do you do?"
          placeholderTextColor={Colors.gray500}
          value={occupation}
          onChangeText={setOccupation}
          onFocus={() => setFocusedField("occupation")}
          onBlur={() => setFocusedField(null)}
          style={[inputBase, focusedField === "occupation" && inputFocused]}
        />

        <Text style={label}>Languages</Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setLanguageModalVisible(true);
          }}
          style={{
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
            marginBottom: 16,
          }}
        >
          <Text style={{ ...Typography.body, color: Colors.textPrimary, flex: 1 }} numberOfLines={1}>
            {languages.length === 0 ? "Choose languages" : languages.join(", ")}
          </Text>
          <Ionicons name="chevron-down" size={20} color={Colors.gray600} />
        </Pressable>

        <Modal
          visible={languageModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLanguageModalVisible(false)}
        >
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 20 }} onPress={() => setLanguageModalVisible(false)}>
            <Pressable style={{ width: "100%", maxWidth: 400, maxHeight: "80%", backgroundColor: Colors.backgroundLight, borderRadius: Layout.radii.card, overflow: "hidden", shadowColor: Colors.softBlack, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 12 }} onPress={(e) => e.stopPropagation()}>
              <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray200 }}>
                <Text style={{ ...Typography.h3, fontFamily: FontFamily.heading, color: Colors.textPrimary, marginBottom: 4 }}>Choose languages</Text>
                <Text style={{ ...Typography.caption, color: Colors.gray600, marginBottom: 8 }}>Your selections appear first in the list.</Text>
                <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setLanguageModalVisible(false); }} style={{ position: "absolute", top: 16, right: 16, padding: 4 }} hitSlop={12}>
                  <Ionicons name="close" size={24} color={Colors.gray600} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 320, paddingVertical: 8 }} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
                {sortedProfileLanguages(languages).map((lang) => {
                  const selected = languages.includes(lang);
                  return (
                    <Pressable
                      key={lang}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setLanguages((prev) => (selected ? prev.filter((l) => l !== lang) : [...prev, lang]));
                      }}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 20, backgroundColor: selected ? Colors.primaryViolet + "18" : "transparent" }}
                    >
                      <Text style={{ ...Typography.body, color: selected ? Colors.primaryViolet : Colors.textPrimary, fontWeight: selected ? "600" : "400" }} numberOfLines={1}>{lang}</Text>
                      {selected && <Ionicons name="checkmark-circle" size={22} color={Colors.primaryViolet} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={{ padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.gray200 }}>
                <Pressable onPress={() => { Haptics.selectionAsync(); setLanguageModalVisible(false); }} style={{ backgroundColor: Colors.primaryViolet, paddingVertical: 14, borderRadius: Layout.radii.control, alignItems: "center" }}>
                  <Text style={{ ...Typography.button, color: Colors.white, fontFamily: FontFamily.heading }}>Done</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Image source={require("@/assets/icons/Instagram_icon.png")} style={{ width: 16, height: 16, marginRight: 8 }} resizeMode="contain" />
          <Text style={[label, { marginBottom: 0 }]}>Instagram</Text>
        </View>
        <TextInput
          placeholder="@username or instagram.com/username"
          placeholderTextColor={Colors.gray500}
          value={instagram}
          onChangeText={setInstagram}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocusedField("instagram")}
          onBlur={() => setFocusedField(null)}
          style={[inputBase, focusedField === "instagram" && inputFocused, { marginBottom: 4 }]}
        />

          </View>

          {/* ─────── SUB-PROFILES ─────── */}
          <View style={[sectionCard, { marginBottom: 8 }]}>
            <Text style={{ ...Typography.h3, color: Colors.textPrimary, marginBottom: 16, fontFamily: FontFamily.heading }}>Mode profiles</Text>
        <RomanceSubProfile
          enabled={romanceEnabled}
          toggle={() => setRomanceEnabled(!romanceEnabled)}
          photos={romancePhotos}
          onPickPhoto={(i) => pickImage("romance", i)}
          video={romanceVideos[0]}
          onPickVideo={() => pickVideo("romance")}
          bio={bioRomance}
          onBioChange={setBioRomance}
          height={heightRomance}
          onHeightChange={setHeightRomance}
          weight={weightRomance}
          onWeightChange={setWeightRomance}
          lifestyle={lifestyleRomance}
          onLifestyleChange={setLifestyleRomance}
          smoking={smokingRomance}
          onSmokingChange={setSmokingRomance}
          alcohol={alcoholRomance}
          onAlcoholChange={setAlcoholRomance}
          kids={kidsRomance}
          onKidsChange={setKidsRomance}
          interests={interestsRomance}
          onInterestsChange={setInterestsRomance}
          sexualViews={sexualViewsRomance}
          onSexualViewsChange={setSexualViewsRomance}
          relationshipGoals={relationshipGoalsRomance}
          onRelationshipGoalsChange={setRelationshipGoalsRomance}
          religion={religionRomance}
          onReligionChange={setReligionRomance}
          politicalViews={politicalViewsRomance}
          onPoliticalViewsChange={setPoliticalViewsRomance}
          values={valuesRomance}
          onValuesChange={setValuesRomance}
          pets={petsRomance}
          onPetsChange={setPetsRomance}
          onPetsToggle={petsToggleRomance}
          allergies={allergiesRomance}
          onAllergiesChange={setAllergiesRomance}
          onAllergiesToggle={allergiesToggleRomance}
          food={foodRomance}
          onFoodChange={setFoodRomance}
          toggleMulti={toggleMulti}
        />
        <FriendsSubProfile
          enabled={friendsEnabled}
          toggle={() => setFriendsEnabled(!friendsEnabled)}
          photos={friendsPhotos}
          onPickPhoto={(i) => pickImage("friends", i)}
          video={friendsVideos[0]}
          onPickVideo={() => pickVideo("friends")}
          bio={bioFriends}
          onBioChange={setBioFriends}
          interests={interestsFriends}
          onInterestsChange={setInterestsFriends}
          lifestyle={lifestyleFriends}
          onLifestyleChange={setLifestyleFriends}
          alcohol={alcoholFriends}
          onAlcoholChange={setAlcoholFriends}
          smoking={smokingFriends}
          onSmokingChange={setSmokingFriends}
          meetupGoals={meetupGoalsFriends}
          onMeetupGoalsChange={setMeetupGoalsFriends}
          status={statusFriends}
          onStatusChange={setStatusFriends}
          kids={kidsFriends}
          onKidsChange={setKidsFriends}
          pets={petsFriends}
          onPetsChange={setPetsFriends}
          onPetsToggle={petsToggleFriends}
          allergies={allergiesFriends}
          onAllergiesChange={setAllergiesFriends}
          onAllergiesToggle={allergiesToggleFriends}
          food={foodFriends}
          onFoodChange={setFoodFriends}
          toggleMulti={toggleMulti}
        />
        <BusinessSubProfile
          enabled={businessEnabled}
          toggle={() => setBusinessEnabled(!businessEnabled)}
          photos={businessPhotos}
          onPickPhoto={(i) => pickImage("business", i)}
          video={businessVideos[0]}
          onPickVideo={() => pickVideo("business")}
          bio={bioBusiness}
          onBioChange={setBioBusiness}
          role={roleBusiness}
          onRoleChange={setRoleBusiness}
          company={companyBusiness}
          onCompanyChange={setCompanyBusiness}
          area={areaBusiness}
          onAreaChange={setAreaBusiness}
          networkingGoals={networkingGoalsBusiness}
          onNetworkingGoalsChange={setNetworkingGoalsBusiness}
          skills={skillsBusiness}
          onSkillsChange={setSkillsBusiness}
          interests={interestsBusiness}
          onInterestsChange={setInterestsBusiness}
          instagram={instagramBusiness}
          onInstagramChange={setInstagramBusiness}
          toggleMulti={toggleMulti}
        />
          </View>

        {/* ─────── Continue ─────── */}
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); handleContinue(); }}
          disabled={saving}
          style={{
            backgroundColor: Colors.primaryViolet,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: "center",
            marginTop: 28,
            opacity: saving ? 0.6 : 1,
            shadowColor: "#5A189A",
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 5,
          }}
        >
          <Text style={{ ...Typography.button, color: Colors.accentYellow, fontFamily: FontFamily.heading }}>
            {saving ? "Saving..." : isEditFlow ? "Save" : "Continue"}
          </Text>
        </TouchableOpacity>
          </Animated.View>
        </ScrollView>

      <PhotoConfirmModal
        visible={cropModalVisible}
        photoUri={pendingCrop?.uri ?? null}
        onSave={onCropSave}
        onClose={() => { setCropModalVisible(false); setPendingCrop(null); }}
      />
    </KeyboardAvoidingView>
    </SafeScreenView>
  );
}

const sectionCard = {
  backgroundColor: Colors.white,
  borderRadius: Layout.radii.card,
  padding: 20,
  ...Shadow.card,
};

const photoSlotEmpty = {
  width: 120,
  height: 120,
  borderRadius: 18,
  backgroundColor: Colors.gray100,
  justifyContent: "center" as const,
  alignItems: "center" as const,
  overflow: "hidden" as const,
  borderWidth: 2,
  borderStyle: "dashed" as const,
  borderColor: Colors.gray300,
  shadowColor: "#1C1C1E",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 3,
};

const photoSlotFilled = {
  width: 120,
  height: 120,
  borderRadius: 18,
  backgroundColor: Colors.gray100,
  justifyContent: "center" as const,
  alignItems: "center" as const,
  overflow: "hidden" as const,
  borderWidth: 1,
  borderColor: Colors.gray200,
  shadowColor: "#1C1C1E",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.12,
  shadowRadius: 6,
  elevation: 4,
};

const inputStyle = {
  borderWidth: 2,
  borderColor: Colors.gray200,
  borderRadius: Layout.radii.control,
  padding: 12,
  paddingHorizontal: 16,
  paddingVertical: 14,
  backgroundColor: Colors.white,
  marginBottom: 12,
  minHeight: Layout.touchTargetMin,
};

const chip = {
  backgroundColor: Colors.primaryViolet,
  borderRadius: 20,
  paddingVertical: 6,
  paddingHorizontal: 12,
  marginRight: 6,
  marginBottom: 6,
};

const addButton = {
  backgroundColor: Colors.primaryViolet,
  borderRadius: Layout.radii.control,
  width: 40,
  height: 40,
  justifyContent: "center" as const,
  alignItems: "center" as const,
  shadowColor: "#5A189A",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 4,
  elevation: 4,
};

const label = {
  ...Typography.body,
  color: Colors.gray700,
  marginBottom: 6,
};

const requiredMark = { color: Colors.errorRed, fontWeight: "700" as const };

const headerBtn = {
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: Colors.gray100,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  shadowColor: "#1C1C1E",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.15,
  shadowRadius: 4,
  elevation: 4,
};

const suggestionList = {
  borderWidth: 1,
  borderColor: Colors.gray100,
  borderRadius: Layout.radii.control,
  maxHeight: 200,
  marginBottom: 12,
  backgroundColor: "#FFF",
};

const suggestionItem = {
  paddingVertical: 10,
  paddingHorizontal: 12,
  borderBottomWidth: 1,
  borderBottomColor: Colors.gray100,
};

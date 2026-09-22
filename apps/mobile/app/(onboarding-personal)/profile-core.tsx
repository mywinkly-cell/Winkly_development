// apps/mobile/app/(onboarding-personal)/profile-core.tsx
// Winkly Unified Profile Setup (Final v7.0) — schema-safe for public.user_profiles
// Notes:
// - Saves ONLY to public.user_profiles (not public.users)
// - Uses upsert(id) so it works even if the row does not exist yet
// - Handles "Auth session missing" safely (redirects to Sign in)
// - On save, local photos/videos are uploaded to Supabase Storage and the
//   resulting public URLs (not file:// URIs) are persisted to the DB.

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
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import DateTimePicker from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { Routes } from "@/constants/routes";
import { trackOnboardingCompleted, trackOnboardingSubProfileSkipped } from "@/lib/analytics/events";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { searchCities, type CityCountry } from "@/lib/location/citySearch";
import {
  normalizeLocationDisplayString,
  formatDefaultLocationDisplay,
} from "@/lib/location/countryDisplay";
import { reverseGeocodeToDisplay } from "@/lib/location";
import { upsertOwnProfileCore } from "@/lib/access/profiles";
import {
  LANGUAGE_OPTIONS as PROFILE_LANGUAGE_OPTIONS,
} from "@/constants/profileOptions";
import { RomanceSubProfile } from "@/components/onboarding/RomanceSubProfile";
import { FriendsSubProfile } from "@/components/onboarding/FriendsSubProfile";
import { BusinessSubProfile } from "@/components/onboarding/BusinessSubProfile";
import { InterestPickerModal } from "@/components/onboarding/InterestPickerModal";
import { GENERAL_INTERESTS_MAX, interestEmoji } from "@/constants/interestCategories";
import {
  buildWizardSteps,
  validateWizardStep,
  inferWizardResumeStep,
  wizardStepLabel,
  clampWizardStepIndex,
  ALL_ONBOARDING_MODES,
  type WizardStep,
  type PrimaryOnboardingMode,
} from "@/lib/profile/onboardingWizard";
import { WizardShell } from "@/components/onboarding/wizard/WizardShell";
import { NameStep, PhotosStep, LocationStep, AboutStep, LanguageModal } from "@/components/onboarding/wizard/GeneralSteps";
import { ModeSelectStep } from "@/components/onboarding/wizard/ModeSelectStep";
import { isModeAvailable } from "@/lib/modes/availability";
import { ReviewStep } from "@/components/onboarding/wizard/ReviewStep";
import { PhotoConfirmModal } from "@/components/media/PhotoConfirmModal";
import { uploadLocalPhotos, uploadLocalPhotosModerated, uploadLocalVideos } from "@/lib/uploadMedia";
import { PhotosInReview } from "@/components/profile/PhotosInReview";
import { validatePickerAsset } from "@/lib/mediaValidation";
import {
  MAX_CORE_PHOTOS,
  MIN_CORE_PHOTOS,
  MIN_PHOTO_DIMENSION,
  validateProfileCoreSubmit,
} from "@/lib/profile/validation";
import { keyboardAvoidingProps, PROFILE_HEADER_KEYBOARD_OFFSET } from "@/lib/ui/keyboardAvoiding";
import {
  buildProfileDraft,
  parseDateOnly,
  seedSavedDraft,
  toISODateOnly,
  type AutosaveMode,
  type ProfileDraft,
} from "@/lib/profile/profileAutosave";
import { useProfileAutosave } from "@/lib/profile/useProfileAutosave";

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

function ensureLength<T>(arr: T[], len: number): T[] {
  const copy = [...arr];
  while (copy.length < len) copy.push(null as T);
  return copy.slice(0, len);
}

function isAuthSessionMissing(err: any) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return (
    msg.includes("auth session missing") ||
    msg.includes("session from session_id") ||
    msg.includes("jwt expired") ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh_token_not_found") ||
    msg.includes("not authenticated")
  );
}

/**
 * Turns a thrown error (Supabase PostgrestError/AuthError or a plain JS Error)
 * into a message safe to show the user, while logging the full diagnostic
 * shape (message/code/details/hint) to the console for debugging. Postgres
 * errors often carry the real reason in `.details`/`.hint` rather than
 * `.message` alone (e.g. a check-constraint or RLS violation).
 */
function describeSaveError(context: string, err: any): string {
  const message = err?.message ?? String(err ?? "Unknown error");
  console.error(`[profile-core] ${context} failed:`, {
    message,
    code: err?.code,
    details: err?.details,
    hint: err?.hint,
    status: err?.status,
  });
  const parts = [message, err?.details, err?.hint].filter(
    (p) => typeof p === "string" && p.trim() && p.trim() !== message.trim()
  );
  return parts.join(" — ") || "Something went wrong while saving your profile.";
}

export default function ProfileCore() {
  const { i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  const router = useRouter();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const isEditFlow = edit === "1";
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const theme = useAppTheme();
  const styles = createStyles(theme);

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

  // ─────────────── CORE PROFILE EXTRAS ───────────────
  // General interests live on the General profile (shared across Romance & Friends).
  const [interests, setInterests] = useState<string[]>([]);
  const [interestsModalVisible, setInterestsModalVisible] = useState(false);
  // Privacy: when off (default), Romance & Friends show only the first name.
  const [showFullName, setShowFullName] = useState(false);

  // ─────────────── MEDIA (UI only for now) ───────────────
  // Core photos: 2–5 required, ordered (first = main). Stored as actual URIs (no null padding).
  const [corePhotos, setCorePhotos] = useState<string[]>([]);
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
  const [sexualViewsRomance, setSexualViewsRomance] = useState("");
  const [relationshipGoalsRomance, setRelationshipGoalsRomance] = useState<string[]>([]);
  const [religionRomance, setReligionRomance] = useState("");
  const [politicalViewsRomance, setPoliticalViewsRomance] = useState("");
  const [valuesRomance, setValuesRomance] = useState<string[]>([]);
  const [petsRomance, setPetsRomance] = useState<string[]>([]);
  const [foodRomance, setFoodRomance] = useState("");

  // Friends fields
  const [lifestyleFriends, setLifestyleFriends] = useState("");
  const [alcoholFriends, setAlcoholFriends] = useState("");
  const [smokingFriends, setSmokingFriends] = useState("");
  const [meetupGoalsFriends, setMeetupGoalsFriends] = useState<string[]>([]);
  const [statusFriends, setStatusFriends] = useState("");
  const [kidsFriends, setKidsFriends] = useState("");
  const [petsFriends, setPetsFriends] = useState<string[]>([]);
  const [foodFriends, setFoodFriends] = useState("");

  // Business fields
  const [roleBusiness, setRoleBusiness] = useState("");
  const [companyBusiness, setCompanyBusiness] = useState("");
  const [areaBusiness, setAreaBusiness] = useState("");
  const [networkingGoalsBusiness, setNetworkingGoalsBusiness] = useState<string[]>([]);
  const [skillsBusiness, setSkillsBusiness] = useState<string[]>([]);
  const [interestsBusiness, setInterestsBusiness] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Own user id + a bump counter so the "Photos in review" strip refetches after a save.
  const [meId, setMeId] = useState<string | null>(null);
  const [photoReviewTick, setPhotoReviewTick] = useState(0);
  // Autosave stays off until the initial load has applied to state (and while it re-runs).
  const [hydrated, setHydrated] = useState(false);
  const hydrationRef = useRef<{ profileRow: boolean; modeRows: AutosaveMode[] }>({ profileRow: false, modeRows: [] });
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<{ uri: string; type: "core" | "romance" | "friends" | "business"; index: number } | null>(null);

  /** Modes enabled for the onboarding wizard — derived straight from the same booleans the edit flow's Switches use. */
  const enabledModes = useMemo(
    () =>
      ALL_ONBOARDING_MODES.filter(
        (m) =>
          isModeAvailable(m) && (m === "romance" ? romanceEnabled : m === "friends" ? friendsEnabled : businessEnabled)
      ),
    [romanceEnabled, friendsEnabled, businessEnabled]
  );

  const toggleMode = useCallback(
    (mode: PrimaryOnboardingMode) => {
      if (!isModeAvailable(mode)) return;
      Haptics.selectionAsync();
      if (mode === "romance") setRomanceEnabled((v) => !v);
      else if (mode === "friends") setFriendsEnabled((v) => !v);
      else setBusinessEnabled((v) => !v);
    },
    []
  );

  const wizardSteps = useMemo(() => buildWizardSteps(enabledModes), [enabledModes]);

  // Keep the current step in range when a mode gets deselected and its steps disappear.
  useEffect(() => {
    setCurrentStepIndex((i) => clampWizardStepIndex(i, wizardSteps.length));
  }, [wizardSteps.length]);

  const currentWizardStep: WizardStep = wizardSteps[clampWizardStepIndex(currentStepIndex, wizardSteps.length)];

  const maxAdultDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d;
  }, []);

  // ─────────────── LOAD FROM SUPABASE + DRAFT + GPS ───────────────
  useEffect(() => {
    (async () => {
      setHydrated(false);
      hydrationRef.current = { profileRow: false, modeRows: [] };
      // A failed read must not enable autosave: it could overwrite real server data with empty/stale state.
      let hydrationFailed = false;
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user) hydrationFailed = true;
        let loadedFromSupabase = false;
        let resumeFromDb: Parameters<typeof inferWizardResumeStep>[0] | null = null;
        let dbEnabledModes: PrimaryOnboardingMode[] = [];
        const dbModeComplete: Partial<Record<PrimaryOnboardingMode, boolean>> = {};
        let dbFirstName = "";
        let dbLastName = "";
        let dbBirthday: Date | null = null;
        let dbCityValue = "";
        let dbCorePhotoCount = 0;

        if (!userError && userData?.user) {
          const userId = userData.user.id;
          setMeId(userId);

          // birthday is intentionally NOT selected from user_profiles: the raw
          // DOB column is locked down at the API layer. The owner reads their own
          // date of birth only via the get_my_birthday() RPC (keyed on auth.uid()).
          const { data: up, error: upErr } = await supabase
            .from("user_profiles")
            .select("first_name, last_name, gender, city, education, occupation, languages, instagram, core_photos, main_photo_url, night_owl, interests, show_full_name")
            .eq("id", userId)
            .maybeSingle();
          if (upErr) hydrationFailed = true;

          const { data: myBirthdayIso } = await supabase.rpc("get_my_birthday");
          // Parsed as a local date: new Date("yyyy-mm-dd") is UTC midnight and shifts a day west of UTC.
          const myBirthdayDate = myBirthdayIso ? parseDateOnly(myBirthdayIso as string) : null;

          const upRow = up as {
            first_name?: string; last_name?: string; gender?: string; birthday?: string;
            city?: string; education?: string; occupation?: string; languages?: string[] | null;
            instagram?: string; core_photos?: string[]; main_photo_url?: string;
            night_owl?: boolean | null; interests?: string[] | null;
            show_full_name?: boolean | null;
          } | null;

          // General interests are the source of truth; we seed from legacy
          // per-mode interests below if the general list is still empty.
          let generalInterests: string[] = Array.isArray(upRow?.interests) ? upRow!.interests! : [];

          if (upRow?.first_name || upRow?.last_name) {
            loadedFromSupabase = true;
            hydrationRef.current.profileRow = true;
            setFirstName(upRow.first_name ?? "");
            setLastName(upRow.last_name ?? "");
            setGender(upRow.gender ?? "");
            setBirthday(myBirthdayDate);
            const dbCity = upRow.city ?? "";
            setCity(dbCity ? normalizeLocationDisplayString(String(dbCity), appLanguage) : "");
            if (dbCity) setCityConfirmed(true);
            setEducation(upRow.education ?? "");
            setLanguages(Array.isArray(upRow.languages) ? upRow.languages : []);
            setOccupation(upRow.occupation ?? "");
            setInstagram(upRow.instagram ?? "");
            setShowFullName(upRow.show_full_name === true);
            const photos = Array.isArray(upRow.core_photos) && upRow.core_photos.length > 0
              ? upRow.core_photos.filter(Boolean)
              : upRow.main_photo_url
                ? [upRow.main_photo_url]
                : [];
            setCorePhotos(photos);
            dbFirstName = upRow.first_name ?? "";
            dbLastName = upRow.last_name ?? "";
            dbBirthday = myBirthdayDate;
            dbCityValue = dbCity;
            dbCorePhotoCount = photos.length;
          }

          const { data: subs, error: subsErr } = await supabase
            .from("sub_profiles")
            .select("mode, bio, photos, interests, meta")
            .eq("user_id", userId);
          if (subsErr) hydrationFailed = true;

          (subs ?? []).forEach((row: { mode: string; bio?: string | null; photos?: string[] | null; interests?: string[] | null; meta?: Record<string, unknown> | null }) => {
            const meta = row.meta ?? {};
            if (row.mode === "romance") {
              loadedFromSupabase = true;
              setRomanceEnabled(true);
              dbEnabledModes.push("romance");
              dbModeComplete.romance = !!row.bio?.trim() && Array.isArray(row.photos) && row.photos.some(Boolean);
              setBioRomance(row.bio ?? "");
              setRomancePhotos(Array.isArray(row.photos) && row.photos.length > 0 ? ensureLength(row.photos, 3) : [null, null, null]);
              if (generalInterests.length === 0 && Array.isArray(row.interests) && row.interests.length > 0) {
                generalInterests = row.interests;
              }
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
              setFoodRomance(String(meta.food ?? ""));
              setRomanceVideos(Array.isArray(meta.videos) ? ensureLength(meta.videos, 1) : [null]);
            }
            if (row.mode === "friends") {
              loadedFromSupabase = true;
              setFriendsEnabled(true);
              dbEnabledModes.push("friends");
              dbModeComplete.friends = !!row.bio?.trim() && Array.isArray(row.photos) && row.photos.some(Boolean);
              setBioFriends(row.bio ?? "");
              setFriendsPhotos(Array.isArray(row.photos) && row.photos.length > 0 ? ensureLength(row.photos, 3) : [null, null, null]);
              if (generalInterests.length === 0 && Array.isArray(row.interests) && row.interests.length > 0) {
                generalInterests = row.interests;
              }
              setLifestyleFriends(String(meta.lifestyle ?? ""));
              setAlcoholFriends(String(meta.alcohol ?? ""));
              setSmokingFriends(String(meta.smoking ?? ""));
              setMeetupGoalsFriends(Array.isArray(meta.meetup_goals) ? meta.meetup_goals : []);
              setStatusFriends(String(meta.status ?? ""));
              setKidsFriends(String(meta.kids ?? ""));
              setPetsFriends(Array.isArray(meta.pets) ? meta.pets : []);
              setFoodFriends(String(meta.food ?? ""));
              setFriendsVideos(Array.isArray(meta.videos) ? ensureLength(meta.videos, 1) : [null]);
            }
            if (row.mode === "business") {
              loadedFromSupabase = true;
              setBusinessEnabled(true);
              dbEnabledModes.push("business");
              dbModeComplete.business = !!row.bio?.trim() && Array.isArray(row.photos) && row.photos.some(Boolean);
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

          setInterests(generalInterests);
          hydrationRef.current.modeRows = [...dbEnabledModes];

          if (loadedFromSupabase) {
            resumeFromDb = {
              firstName: dbFirstName,
              lastName: dbLastName,
              birthday: dbBirthday,
              city: dbCityValue,
              corePhotoCount: dbCorePhotoCount,
              enabledModes: dbEnabledModes,
              modeComplete: dbModeComplete,
            };
          }
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
            setInterests(Array.isArray(data.interests) ? data.interests : []);
            setShowFullName(data.showFullName === true);
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
            setSexualViewsRomance(data.sexualViewsRomance ?? "");
            setRelationshipGoalsRomance(data.relationshipGoalsRomance ?? []);
            setReligionRomance(data.religionRomance ?? "");
            setPoliticalViewsRomance(data.politicalViewsRomance ?? "");
            setValuesRomance(data.valuesRomance ?? []);
            setPetsRomance(data.petsRomance ?? []);
            setFoodRomance(data.foodRomance ?? "");
            setLifestyleFriends(data.lifestyleFriends ?? "");
            setAlcoholFriends(data.alcoholFriends ?? "");
            setSmokingFriends(data.smokingFriends ?? "");
            setMeetupGoalsFriends(data.meetupGoalsFriends ?? []);
            setStatusFriends(data.statusFriends ?? "");
            setKidsFriends(data.kidsFriends ?? "");
            setPetsFriends(data.petsFriends ?? []);
            setFoodFriends(data.foodFriends ?? "");
            setRoleBusiness(data.roleBusiness ?? "");
            setCompanyBusiness(data.companyBusiness ?? "");
            setAreaBusiness(data.areaBusiness ?? "");
            setNetworkingGoalsBusiness(Array.isArray(data.networkingGoalsBusiness) ? data.networkingGoalsBusiness : []);
            setSkillsBusiness(Array.isArray(data.skillsBusiness) ? data.skillsBusiness : []);
            setInterestsBusiness(data.interestsBusiness ?? []);

            setCorePhotos(Array.isArray(data.corePhotos) ? data.corePhotos.filter(Boolean) : []);
            setRomancePhotos(data.romancePhotos ?? [null, null, null]);
            setFriendsPhotos(data.friendsPhotos ?? [null, null, null]);
            setBusinessPhotos(ensureLength(data.businessPhotos ?? [null, null, null], 3));
            setRomanceVideos(ensureLength(data.romanceVideos ?? [null], 1));
            setFriendsVideos(ensureLength(data.friendsVideos ?? [null], 1));
            setBusinessVideos(ensureLength(data.businessVideos ?? [null], 1));
            if (!isEditFlow) {
              const photoCount = Array.isArray(data.corePhotos) ? data.corePhotos.filter(Boolean).length : 0;
              const draftEnabledModes = ALL_ONBOARDING_MODES.filter((m) =>
                m === "romance" ? (data.romanceEnabled ?? true) : m === "friends" ? !!data.friendsEnabled : !!data.businessEnabled
              );
              setCurrentStepIndex(
                inferWizardResumeStep({
                  firstName: data.firstName ?? "",
                  lastName: data.lastName ?? "",
                  birthday: data.birthday ? new Date(data.birthday) : null,
                  city: data.city ?? "",
                  corePhotoCount: photoCount,
                  enabledModes: draftEnabledModes,
                  modeComplete: {
                    romance: !!data.bioRomance?.trim() && Array.isArray(data.romancePhotos) && data.romancePhotos.some(Boolean),
                    friends: !!data.bioFriends?.trim() && Array.isArray(data.friendsPhotos) && data.friendsPhotos.some(Boolean),
                    business: !!data.bioBusiness?.trim() && Array.isArray(data.businessPhotos) && data.businessPhotos.some(Boolean),
                  },
                  savedStepIndex: typeof data.onboardingStepIndex === "number" ? data.onboardingStepIndex : null,
                })
              );
            }
          }
        }

        if (resumeFromDb && !isEditFlow) {
          const draftRaw = await AsyncStorage.getItem("winkly_profile_draft");
          const savedStepIndex = draftRaw ? (JSON.parse(draftRaw).onboardingStepIndex as number | undefined) : undefined;
          setCurrentStepIndex(inferWizardResumeStep({ ...resumeFromDb, savedStepIndex: savedStepIndex ?? null }));
        }
      } catch (e) {
        hydrationFailed = true;
        console.warn("Profile draft/location init warning:", e);
      }
      setHydrated(!hydrationFailed);
    })();
  }, [appLanguage, isEditFlow]);

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
      interests,
      showFullName,
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
      sexualViewsRomance,
      relationshipGoalsRomance,
      religionRomance,
      politicalViewsRomance,
      valuesRomance,
      petsRomance,
      foodRomance,
      lifestyleFriends,
      alcoholFriends,
      smokingFriends,
      meetupGoalsFriends,
      statusFriends,
      kidsFriends,
      petsFriends,
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
      onboardingStepIndex: currentStepIndex,
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
    interests,
    showFullName,
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
    sexualViewsRomance,
    relationshipGoalsRomance,
    religionRomance,
      politicalViewsRomance,
      valuesRomance,
      petsRomance,
      foodRomance,
    lifestyleFriends,
    alcoholFriends,
    smokingFriends,
    meetupGoalsFriends,
      statusFriends,
      kidsFriends,
      petsFriends,
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
    currentStepIndex,
  ]);

  useEffect(() => {
    const timeout = setTimeout(() => autoSave(), 900);
    return () => clearTimeout(timeout);
  }, [autoSave]);

  // ─────────────── AUTOSAVE TO SUPABASE ───────────────
  // One memoized draft of every editable field. Photos/videos are left out on purpose:
  // they only reach Storage (and the DB) through the explicit Save's upload step.
  const profileDraft = useMemo(
    () =>
      buildProfileDraft({
        firstName, lastName, gender, birthday,
        city: city.trim() ? normalizeLocationDisplayString(city.trim(), appLanguage) : "",
        education, occupation, languages, instagram, interests, showFullName,
        romanceEnabled, friendsEnabled, businessEnabled,
        bioRomance, heightRomance, weightRomance, lifestyleRomance, smokingRomance, alcoholRomance,
        kidsRomance, sexualViewsRomance, relationshipGoalsRomance, religionRomance, politicalViewsRomance,
        valuesRomance, petsRomance, foodRomance,
        bioFriends, lifestyleFriends, alcoholFriends, smokingFriends, meetupGoalsFriends, statusFriends,
        kidsFriends, petsFriends, foodFriends,
        bioBusiness, roleBusiness, companyBusiness, areaBusiness, networkingGoalsBusiness, skillsBusiness,
        interestsBusiness, instagramBusiness,
      }),
    [
      firstName, lastName, gender, birthday, city, appLanguage, education, occupation, languages, instagram,
      interests, showFullName, romanceEnabled, friendsEnabled, businessEnabled,
      bioRomance, heightRomance, weightRomance, lifestyleRomance, smokingRomance, alcoholRomance,
      kidsRomance, sexualViewsRomance, relationshipGoalsRomance, religionRomance, politicalViewsRomance,
      valuesRomance, petsRomance, foodRomance,
      bioFriends, lifestyleFriends, alcoholFriends, smokingFriends, meetupGoalsFriends, statusFriends,
      kidsFriends, petsFriends, foodFriends,
      bioBusiness, roleBusiness, companyBusiness, areaBusiness, networkingGoalsBusiness, skillsBusiness,
      interestsBusiness, instagramBusiness,
    ]
  );

  const seedSaved = useCallback(
    (hydratedDraft: ProfileDraft) => seedSavedDraft(hydratedDraft, hydrationRef.current),
    []
  );

  // Debounced (~1.5 s) diff-only save; flushes on step change, blur/unmount and app background.
  const { status: autosaveStatus, flush: flushAutosave } = useProfileAutosave({
    draft: profileDraft,
    ready: hydrated,
    seedSaved,
    flushKey: currentStepIndex,
  });

  // ─────────────── CITY AUTOCOMPLETE (Nominatim) ───────────────
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
      setSuggestions(fromApi);
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

    const asset = result.assets[0];

    // Size + MIME validation before any upload work (avoids wasted API calls).
    const sizeCheck = await validatePickerAsset(asset, "image");
    if (!sizeCheck.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Photo not allowed", sizeCheck.reason ?? "Please pick a different photo.");
      return;
    }

    // Photo quality validation: reject images that are too low-res to look sharp.
    // (Face detection would require a native module + rebuild; deferred — see edit-media TODO.)
    const w = asset.width ?? 0;
    const h = asset.height ?? 0;
    if (w && h && Math.min(w, h) < MIN_PHOTO_DIMENSION) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        "Photo quality too low",
        `For a sharp, clear profile, please pick a photo at least ${MIN_PHOTO_DIMENSION}×${MIN_PHOTO_DIMENSION}px. This one is ${w}×${h}px.`
      );
      return;
    }

    let uri = asset.uri;
    if (!uri.startsWith("http")) {
      try {
        const ext = uri.toLowerCase().includes(".png") ? "png" : "jpg";
        const dest = `${FileSystem.cacheDirectory ?? ""}winkly_photo_${Date.now()}.${ext}`;
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
      setCorePhotos((prev) => {
        const updated = [...prev];
        if (index >= updated.length) updated.push(uri);
        else updated[index] = uri;
        return updated.slice(0, MAX_CORE_PHOTOS);
      });
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

  // ─────────────── CORE PHOTO MANAGEMENT (reorder / remove / main) ───────────────
  const removeCorePhoto = (index: number) => {
    Haptics.selectionAsync();
    setCorePhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const moveCorePhoto = (index: number, dir: -1 | 1) => {
    setCorePhotos((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    Haptics.selectionAsync();
  };

  const setMainCorePhoto = (index: number) => {
    setCorePhotos((prev) => {
      if (index <= 0 || index >= prev.length) return prev;
      const next = [...prev];
      const [picked] = next.splice(index, 1);
      next.unshift(picked);
      return next;
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  /** Tap a filled core photo → reorder / main / remove options. */
  const openCorePhotoOptions = (index: number) => {
    Haptics.selectionAsync();
    const options: { text: string; onPress?: () => void; style?: "cancel" | "destructive" }[] = [];
    if (index !== 0) options.push({ text: "Make main photo", onPress: () => setMainCorePhoto(index) });
    if (index > 0) options.push({ text: "Move left", onPress: () => moveCorePhoto(index, -1) });
    if (index < corePhotos.length - 1) options.push({ text: "Move right", onPress: () => moveCorePhoto(index, 1) });
    options.push({ text: "Replace photo", onPress: () => pickImage("core", index) });
    options.push({ text: "Remove photo", style: "destructive", onPress: () => removeCorePhoto(index) });
    options.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Edit photo", index === 0 ? "This is your main photo." : undefined, options);
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
        const dest = `${FileSystem.cacheDirectory ?? ""}winkly_video_${Date.now()}.mp4`;
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
    const validation = validateProfileCoreSubmit({
      firstName,
      lastName,
      gender,
      birthday,
      city,
      corePhotoCount: corePhotos.length,
    });
    if (!validation.ok) {
      Alert.alert(validation.title, validation.message);
      return;
    }
    if (!birthday) return;

    setSaveError(null);
    try {
      setSaving(true);
      // Land any pending autosave first; the full write below then supersedes it. A failed flush
      // is fine here: the full write reports its own error.
      await flushAutosave();

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

      // Persist local photos to Supabase Storage BEFORE writing the DB row, so
      // the profile never ends up pointing at a dead file:// URI. uploadLocalPhotos
      // already tolerates individual photo failures (it alerts and skips them) —
      // we only hard-fail the save here if too few photos survive to still meet
      // the product minimum the user already satisfied on-device.
      // Photos are moderated server-side (docs/MODERATION.md): ones held for review
      // aren't on the profile yet but count toward the minimum — the server adds
      // them once approved. Blocked ones don't count (the user was told why).
      let uploadedCorePhotos: string[];
      let heldCorePhotos = 0;
      try {
        const coreUpload = await uploadLocalPhotosModerated(authUser.id, "core", corePhotos);
        uploadedCorePhotos = coreUpload.urls;
        heldCorePhotos = coreUpload.held;
      } catch (uploadErr) {
        console.error("[profile-core] core photo upload threw:", uploadErr);
        throw uploadErr;
      }
      setPhotoReviewTick((n) => n + 1);
      if (uploadedCorePhotos.length + heldCorePhotos < MIN_CORE_PHOTOS) {
        throw new Error(
          `Only ${uploadedCorePhotos.length} of ${corePhotos.length} photo(s) uploaded successfully. Please check your connection and try again.`
        );
      }
      setCorePhotos(uploadedCorePhotos);

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
        interests: interests.length ? interests : null,
        show_full_name: showFullName,
        core_photos: uploadedCorePhotos,
        main_photo_url: uploadedCorePhotos[0] || null,
      };

      const { error: upsertErr } = await supabase
        .from("user_profiles")
        .upsert(payload, { onConflict: "id" });

      if (upsertErr) throw upsertErr;

      const { error: coreErr } = await upsertOwnProfileCore(authUser.id, {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        city: cityNorm,
        interests: interests.length ? interests : null,
        show_full_name: showFullName,
      });
      if (coreErr) throw coreErr;

      // The wizard's "modes" step lets the user enable any combination of
      // Romance/Friends/Business, same as the edit flow's per-mode Switches —
      // whichever are enabled get their sub-profile written, regardless of flow.
      const saveRomance = romanceEnabled;
      const saveFriends = friendsEnabled;
      const saveBusiness = businessEnabled;

      // Sub-profile writes are best-effort: a hiccup saving the Romance bio
      // shouldn't strand the user on this screen after their core profile and
      // photos already saved successfully. Failures are logged and surfaced as
      // a non-blocking warning once onboarding otherwise completes.
      const subProfileWarnings: string[] = [];

      if (saveRomance) {
        const uploadedRomancePhotos = await uploadLocalPhotos(authUser.id, "romance", romancePhotos);
        const uploadedRomanceVideos = await uploadLocalVideos(authUser.id, "romance", romanceVideos);
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
          food: foodRomance || null,
          videos: uploadedRomanceVideos,
        };
        const romancePayload = {
          user_id: authUser.id,
          mode: "romance",
          bio: bioRomance || null,
          photos: uploadedRomancePhotos,
          interests: interests.length ? interests : null,
          meta: romanceMeta,
        };
        const { error: romanceSubErr } = await supabase
          .from("sub_profiles")
          .upsert(romancePayload, { onConflict: "user_id,mode" });
        if (romanceSubErr) subProfileWarnings.push(describeSaveError("romance sub_profiles", romanceSubErr));
        const { error: romanceModeErr } = await supabase.from("profiles_mode").upsert(
          { ...romancePayload, updated_at: new Date().toISOString() },
          { onConflict: "user_id,mode" }
        );
        if (romanceModeErr) subProfileWarnings.push(describeSaveError("romance profiles_mode", romanceModeErr));
      }
      if (saveFriends) {
        const uploadedFriendsPhotos = await uploadLocalPhotos(authUser.id, "friends", friendsPhotos);
        const uploadedFriendsVideos = await uploadLocalVideos(authUser.id, "friends", friendsVideos);
        const friendsMeta: Record<string, unknown> = {
          lifestyle: lifestyleFriends || null,
          alcohol: alcoholFriends || null,
          smoking: smokingFriends || null,
          meetup_goals: meetupGoalsFriends,
          status: statusFriends || null,
          kids: kidsFriends || null,
          pets: petsFriends,
          food: foodFriends || null,
          videos: uploadedFriendsVideos,
        };
        const friendsPayload = {
          user_id: authUser.id,
          mode: "friends",
          bio: bioFriends || null,
          photos: uploadedFriendsPhotos,
          interests: interests.length ? interests : null,
          meta: friendsMeta,
        };
        const { error: friendsSubErr } = await supabase
          .from("sub_profiles")
          .upsert(friendsPayload, { onConflict: "user_id,mode" });
        if (friendsSubErr) subProfileWarnings.push(describeSaveError("friends sub_profiles", friendsSubErr));
        const { error: friendsModeErr } = await supabase.from("profiles_mode").upsert(
          { ...friendsPayload, updated_at: new Date().toISOString() },
          { onConflict: "user_id,mode" }
        );
        if (friendsModeErr) subProfileWarnings.push(describeSaveError("friends profiles_mode", friendsModeErr));
      }
      if (saveBusiness) {
        const uploadedBusinessPhotos = await uploadLocalPhotos(authUser.id, "business", businessPhotos);
        const uploadedBusinessVideos = await uploadLocalVideos(authUser.id, "business", businessVideos);
        const businessMeta: Record<string, unknown> = {
          role: roleBusiness.trim() || null,
          company: companyBusiness.trim() || null,
          area: areaBusiness.trim() || null,
          networking_goals: networkingGoalsBusiness.length ? networkingGoalsBusiness : null,
          skills: skillsBusiness.length ? skillsBusiness : null,
          interests: interestsBusiness,
          instagram: instagramBusiness.trim() || null,
          videos: uploadedBusinessVideos,
        };
        const businessPayload = {
          user_id: authUser.id,
          mode: "business",
          bio: bioBusiness || null,
          photos: uploadedBusinessPhotos,
          interests: interestsBusiness.length ? interestsBusiness : null,
          meta: businessMeta,
        };
        const { error: businessSubErr } = await supabase
          .from("sub_profiles")
          .upsert(businessPayload, { onConflict: "user_id,mode" });
        if (businessSubErr) subProfileWarnings.push(describeSaveError("business sub_profiles", businessSubErr));
        const { error: businessModeErr } = await supabase.from("profiles_mode").upsert(
          { ...businessPayload, updated_at: new Date().toISOString() },
          { onConflict: "user_id,mode" }
        );
        if (businessModeErr) subProfileWarnings.push(describeSaveError("business profiles_mode", businessModeErr));
      }

      if (subProfileWarnings.length) {
        console.warn("[profile-core] non-fatal sub-profile save issues:", subProfileWarnings);
      }

      await AsyncStorage.removeItem("winkly_profile_draft");
      if (!isEditFlow && !saveRomance && !saveFriends && !saveBusiness) {
        trackOnboardingSubProfileSkipped({ skipped_mode: "none", onboarding_step: wizardSteps.length });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (isEditFlow) {
        router.back();
        return;
      }
      const skipWinklyWorld = await import("@/lib/introFlags").then((m) => m.shouldSkipWinklyWorld());
      if (skipWinklyWorld) {
        trackOnboardingCompleted({ account_type: "personal" });
        router.push(Routes.modeSelection);
      } else {
        router.push("/(onboarding-personal)/winkly-world?variant=personal");
      }
    } catch (err: any) {
      const message = describeSaveError("profile save", err);
      setSaveError(message);
      Alert.alert("Save failed", message);
    } finally {
      setSaving(false);
    }
  };

  const handleStepContinue = async () => {
    if (isEditFlow) {
      await handleContinue();
      return;
    }
    if (currentWizardStep.kind === "review") {
      await handleContinue();
      return;
    }
    const stepValidation = validateWizardStep(currentWizardStep, {
      firstName,
      lastName,
      birthday,
      city,
      gender,
      corePhotoCount: corePhotos.length,
      romance: { bio: bioRomance, photos: romancePhotos, relationshipGoals: relationshipGoalsRomance },
      friends: { bio: bioFriends, photos: friendsPhotos, meetupGoals: meetupGoalsFriends },
      business: { bio: bioBusiness, photos: businessPhotos, networkingGoals: networkingGoalsBusiness },
    });
    if (!stepValidation.ok) {
      Alert.alert(stepValidation.title, stepValidation.message);
      return;
    }
    await autoSave();
    Haptics.selectionAsync();
    // The step change below flushes the server autosave; Next never waits on the network.
    setCurrentStepIndex((i) => Math.min(i + 1, wizardSteps.length - 1));
  };

  const handleHeaderBack = () => {
    Haptics.selectionAsync();
    if (!isEditFlow && currentStepIndex > 0) {
      setCurrentStepIndex((i) => i - 1);
      return;
    }
    router.back();
  };

  const jumpToStep = useCallback((predicate: (step: WizardStep) => boolean) => {
    Haptics.selectionAsync();
    const index = wizardSteps.findIndex(predicate);
    if (index >= 0) setCurrentStepIndex(index);
  }, [wizardSteps]);

  const photoStepSubProgress = useMemo(
    () => Math.min(corePhotos.length / MIN_CORE_PHOTOS, 1),
    [corePhotos.length]
  );

  const coreChecklist = useMemo(
    () => [
      corePhotos.length >= MIN_CORE_PHOTOS,
      !!firstName.trim(),
      !!lastName.trim(),
      !!birthday,
      !!gender.trim(),
      !!city.trim(),
    ],
    [corePhotos.length, firstName, lastName, birthday, gender, city]
  );

  const coreProgress = useMemo(() => {
    const has = coreChecklist.filter(Boolean).length;
    return Math.round((has / coreChecklist.length) * 100);
  }, [coreChecklist]);

  const overallProgress = useMemo(() => {
    let total = 0;
    let max = coreChecklist.length;
    const coreHas = coreChecklist.filter(Boolean).length;
    total += coreHas;
    if (romanceEnabled) {
      max += 3;
      total += [!!bioRomance.trim(), romancePhotos.some(Boolean), interests.length > 0].filter(Boolean).length;
    }
    if (friendsEnabled) {
      max += 3;
      total += [!!bioFriends.trim(), friendsPhotos.some(Boolean), interests.length > 0].filter(Boolean).length;
    }
    if (businessEnabled) {
      max += 3;
      total += [!!bioBusiness.trim(), businessPhotos.some(Boolean), networkingGoalsBusiness.length > 0].filter(Boolean).length;
    }
    return Math.round((total / max) * 100);
  }, [
    coreChecklist,
    interests,
    romanceEnabled, bioRomance, romancePhotos,
    friendsEnabled, bioFriends, friendsPhotos,
    businessEnabled, bioBusiness, businessPhotos, networkingGoalsBusiness,
  ]);

  const inputBase = {
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    fontSize: 16,
    minHeight: 44,
  };
  const inputFocused = { borderColor: theme.colors.primary, ...theme.elevation(1) };

  const birthdayLabel = birthday
    ? `${birthday.getDate()}.${birthday.getMonth() + 1}.${birthday.getFullYear()}`
    : "";

  function renderWizardStepBody(): React.ReactNode {
    const step = currentWizardStep;

    if (step.kind === "general") {
      switch (step.id) {
        case "name":
          return (
            <NameStep
              firstName={firstName}
              onFirstNameChange={setFirstName}
              lastName={lastName}
              onLastNameChange={setLastName}
              birthday={birthday}
              showDatePicker={showDatePicker}
              onShowDatePicker={() => { Haptics.selectionAsync(); setShowDatePicker(true); }}
              onDatePickerChange={setBirthday}
              onDatePickerDismiss={() => setShowDatePicker(false)}
              maxAdultDate={maxAdultDate}
            />
          );
        case "photos":
          return (
            <>
              <PhotosStep
                corePhotos={corePhotos}
                onOpenPhotoOptions={openCorePhotoOptions}
                onAddPhoto={() => pickImage("core", corePhotos.length)}
                onRemovePhoto={removeCorePhoto}
              />
              <PhotosInReview userId={meId} mode="core" refreshKey={photoReviewTick} />
            </>
          );
        case "location":
          return (
            <LocationStep
              city={city}
              onCityChange={onCityChange}
              suggestions={suggestions}
              cityConfirmed={cityConfirmed}
              onSelectCity={selectCity}
              appLanguage={appLanguage}
              onRequestLocation={() => { Haptics.selectionAsync(); requestLocationForCity(); }}
              locationLoading={locationLoading}
              locationPermissionStatus={locationPermissionStatus}
              gender={gender}
              onGenderChange={(g) => { Haptics.selectionAsync(); setGender(g); }}
              showFullName={showFullName}
              onShowFullNameChange={(v) => { Haptics.selectionAsync(); setShowFullName(v); }}
            />
          );
        case "about":
          return (
            <AboutStep
              education={education}
              onEducationChange={(e) => { Haptics.selectionAsync(); setEducation(e); }}
              occupation={occupation}
              onOccupationChange={setOccupation}
              languages={languages}
              onOpenLanguageModal={() => { Haptics.selectionAsync(); setLanguageModalVisible(true); }}
              instagram={instagram}
              onInstagramChange={setInstagram}
              interests={interests}
              onRemoveInterest={(it) => { Haptics.selectionAsync(); setInterests((prev) => prev.filter((x) => x !== it)); }}
              onOpenInterestsModal={() => { Haptics.selectionAsync(); setInterestsModalVisible(true); }}
            />
          );
        case "modes":
          return <ModeSelectStep enabledModes={new Set(enabledModes)} onToggleMode={toggleMode} />;
      }
    }

    if (step.kind === "mode") {
      const section = step.id;
      if (step.mode === "romance") {
        return (
          <RomanceSubProfile
            enabled
            hideToggle
            hideHeader
            toggle={() => {}}
            section={section}
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
            food={foodRomance}
            onFoodChange={setFoodRomance}
            toggleMulti={toggleMulti}
          />
        );
      }
      if (step.mode === "friends") {
        return (
          <FriendsSubProfile
            enabled
            hideToggle
            hideHeader
            toggle={() => {}}
            section={section}
            photos={friendsPhotos}
            onPickPhoto={(i) => pickImage("friends", i)}
            video={friendsVideos[0]}
            onPickVideo={() => pickVideo("friends")}
            bio={bioFriends}
            onBioChange={setBioFriends}
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
            food={foodFriends}
            onFoodChange={setFoodFriends}
            toggleMulti={toggleMulti}
          />
        );
      }
      return (
        <BusinessSubProfile
          enabled
          hideToggle
          hideHeader
          toggle={() => {}}
          section={section}
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
      );
    }

    // review
    return (
      <ReviewStep
        onEditGeneral={() => jumpToStep((s) => s.kind === "general" && s.id === "name")}
        firstName={firstName}
        lastName={lastName}
        birthdayLabel={birthdayLabel}
        city={city}
        gender={gender}
        corePhotos={corePhotos}
        enabledModes={enabledModes}
        onEditMode={(mode) => jumpToStep((s) => s.kind === "mode" && s.mode === mode && s.id === "photosBio")}
        modeSummary={{
          romance: { bio: bioRomance, photos: romancePhotos },
          friends: { bio: bioFriends, photos: friendsPhotos },
          business: { bio: bioBusiness, photos: businessPhotos },
        }}
      />
    );
  }

  // ─────────────── UI ───────────────
  return (
    <SafeScreenView style={{ flex: 1, backgroundColor: theme.colors.backgroundMuted }}>
      <KeyboardAvoidingView
        {...keyboardAvoidingProps(PROFILE_HEADER_KEYBOARD_OFFSET)}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, ...theme.elevation(1) }}>
          <TouchableOpacity
            onPress={handleHeaderBack}
            style={styles.headerBtn}
            activeOpacity={0.9}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ ...theme.type.h2, color: theme.colors.textPrimary, fontFamily: theme.type.h2.fontFamily }}>Your Profile</Text>
          </View>
          <TouchableOpacity
            onPress={async () => {
              Haptics.selectionAsync();
              await autoSave();
              // Bounded wait: the preview should see fresh data, but a bad connection must not freeze the button.
              await Promise.race([flushAutosave(), new Promise((resolve) => setTimeout(resolve, 3000))]);
              router.push("/profile/view-profile");
            }}
            style={styles.headerBtn}
            activeOpacity={0.9}
            accessibilityLabel="Preview how your card looks to others"
          >
            <Ionicons name="eye-outline" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.xl, paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim }}>
            {isEditFlow ? (
              <>
            {/* Progress — matches mode selection formula (bio, photos, interests per sub-profile) */}
            <View style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ ...theme.type.body, color: theme.colors.textSecondary }}>Profile completion</Text>
                <Text style={{ ...theme.type.button, color: theme.colors.primary }}>{overallProgress}%</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: "hidden" }}>
                <View style={{ height: "100%", width: `${overallProgress}%`, backgroundColor: theme.colors.primary, borderRadius: 3 }} />
              </View>
            </View>

            <View style={[styles.sectionCard, { marginBottom: 20 }]}>
              <Text style={{ ...theme.type.h3, color: theme.colors.textSecondary, marginBottom: 16, fontFamily: theme.type.h3.fontFamily }}>
                About you 💫
              </Text>

              <Text style={styles.label}>Photos <Text style={styles.requiredMark}>*</Text></Text>
              <Text style={{ ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: 12 }}>
                Add {MIN_CORE_PHOTOS}–{MAX_CORE_PHOTOS} photos. Your first photo is your main one — tap any photo to reorder or remove it. ({corePhotos.length}/{MAX_CORE_PHOTOS})
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 }}>
                {corePhotos.map((uri, i) => (
                  <View key={`core-${i}-${uri}`} style={{ width: "33.333%", padding: 6 }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => openCorePhotoOptions(i)}
                      style={styles.corePhotoTile}
                    >
                      <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                      {i === 0 && (
                        <View style={styles.mainBadge}>
                          <Text style={styles.mainBadgeText}>Main</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => removeCorePhoto(i)}
                        style={styles.removeBadge}
                        hitSlop={8}
                        accessibilityLabel="Remove photo"
                      >
                        <Ionicons name="close" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  </View>
                ))}
                {corePhotos.length < MAX_CORE_PHOTOS && (
                  <View style={{ width: "33.333%", padding: 6 }}>
                    <TouchableOpacity
                      onPress={() => pickImage("core", corePhotos.length)}
                      style={styles.corePhotoAddTile}
                      accessibilityLabel="Add photo"
                    >
                      <Ionicons name="add" size={30} color={theme.colors.primary} />
                      <Text style={{ ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 4 }}>Add</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <PhotosInReview userId={meId} mode="core" refreshKey={photoReviewTick} />
              {corePhotos.length < MIN_CORE_PHOTOS ? (
                <Text style={{ ...theme.type.caption, color: theme.colors.error, marginTop: 6, marginBottom: 18 }}>
                  Add at least {MIN_CORE_PHOTOS} photos to start matching.
                </Text>
              ) : (
                <Text style={{ ...theme.type.caption, color: theme.colors.textMuted, marginTop: 6, marginBottom: 18 }}>
                  Tip: clear, well-lit photos of your face get more matches.
                </Text>
              )}

              <Text style={styles.label}>First name <Text style={styles.requiredMark}>*</Text></Text>
              <TextInput
                placeholder="First name"
                placeholderTextColor={theme.colors.textMuted}
                value={firstName}
                onChangeText={setFirstName}
                onFocus={() => setFocusedField("firstName")}
                onBlur={() => setFocusedField(null)}
                style={[inputBase, focusedField === "firstName" && inputFocused]}
              />
              <Text style={styles.label}>Last name <Text style={styles.requiredMark}>*</Text></Text>
              <TextInput
                placeholder="Last name"
                placeholderTextColor={theme.colors.textMuted}
                value={lastName}
                onChangeText={setLastName}
                onFocus={() => setFocusedField("lastName")}
                onBlur={() => setFocusedField(null)}
                style={[inputBase, focusedField === "lastName" && inputFocused]}
              />

              <Text style={styles.label}>Birth date <Text style={styles.requiredMark}>*</Text></Text>
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync(); setShowDatePicker(true); }}
                style={[inputBase, { justifyContent: "center" }]}
              >
                <Text style={{ ...theme.type.body, color: birthday ? theme.colors.textPrimary : theme.colors.textMuted }}>
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

        <Text style={{ ...theme.type.caption, color: theme.colors.textMuted, marginBottom: 16 }}>
          Your birthday will remain private — only your age will be visible.
        </Text>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.surface,
            marginBottom: 16,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.label, { marginBottom: 2 }]}>Show my full name in Romance &amp; Friends</Text>
            <Text style={{ ...theme.type.caption, color: theme.colors.textMuted }}>
              Off by default — others see only your first name on cards and your profile. Business networking always shows your full name.
            </Text>
          </View>
          <Switch
            value={showFullName}
            onValueChange={(v) => { Haptics.selectionAsync(); setShowFullName(v); }}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
            thumbColor={theme.colors.surface}
          />
        </View>

        <Text style={[styles.label, { marginBottom: 8 }]}>Gender <Text style={styles.requiredMark}>*</Text></Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
          {["Female", "Male", "Other"].map((g) => (
            <TouchableOpacity
              key={g}
              onPress={() => { Haptics.selectionAsync(); setGender(g); }}
              style={{
                flex: 1,
                marginHorizontal: 4,
                backgroundColor: gender === g ? theme.colors.primary : theme.colors.surface,
                borderWidth: 2,
                borderColor: gender === g ? theme.colors.primary : theme.colors.border,
                borderRadius: theme.radii.md,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ ...theme.type.body, color: gender === g ? theme.colors.onPrimary : theme.colors.textPrimary }}>
                {g}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={[styles.label, { marginBottom: 0 }]}>City <Text style={styles.requiredMark}>*</Text></Text>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); requestLocationForCity(); }}
            disabled={locationLoading}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 16,
              backgroundColor: locationPermissionStatus === "granted" ? theme.colors.primary + "15" : theme.colors.border + "80",
              shadowColor: locationPermissionStatus === "granted" ? theme.colors.primary : "transparent",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: locationPermissionStatus === "granted" ? 0.15 : 0,
              shadowRadius: 4,
              elevation: locationPermissionStatus === "granted" ? 3 : 0,
              opacity: locationLoading ? 0.7 : 1,
            }}
          >
            {locationLoading ? (
              <Text style={{ ...theme.type.caption, fontWeight: "600", color: theme.colors.textSecondary, marginRight: 6 }}>Getting location…</Text>
            ) : (
              <>
                <Ionicons name="locate" size={16} color={locationPermissionStatus === "granted" ? theme.colors.primary : theme.colors.textMuted} style={{ marginRight: 6 }} />
                <Text style={{ ...theme.type.caption, fontWeight: "600", color: locationPermissionStatus === "granted" ? theme.colors.primary : theme.colors.textSecondary }}>
                  {locationPermissionStatus === "denied" ? "Enable location" : "Use my location"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <TextInput
          placeholder="e.g. Berlin, London"
          placeholderTextColor={theme.colors.textMuted}
          value={city}
          onChangeText={onCityChange}
          onFocus={() => setFocusedField("city")}
          onBlur={() => setFocusedField(null)}
          style={[inputBase, focusedField === "city" && inputFocused]}
        />

        {suggestions.length > 0 && !cityConfirmed && (
          <View style={[styles.suggestionList, { ...theme.elevation(1) }]}>
            {suggestions.map((item) => (
              <TouchableOpacity
                key={`${item.city}-${item.country}`}
                onPress={() => { Haptics.selectionAsync(); selectCity(item); }}
                style={styles.suggestionItem}
              >
                <Text style={{ color: theme.colors.textPrimary }}>
                  {formatDefaultLocationDisplay(item.city, item.country, appLanguage)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

          </View>

          <View style={[styles.sectionCard, { marginBottom: 20 }]}>
            <Text style={{ ...theme.type.h3, color: theme.colors.textSecondary, marginBottom: 16, fontFamily: theme.type.h3.fontFamily }}>More about you</Text>

        <Text style={styles.label}>Education</Text>
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
                backgroundColor: education === e ? theme.colors.primary : theme.colors.backgroundMuted,
              }}
            >
              <Text style={{ ...theme.type.caption, color: education === e ? theme.colors.onPrimary : theme.colors.textPrimary }}>
                {e}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Occupation</Text>
        <TextInput
          placeholder="What do you do?"
          placeholderTextColor={theme.colors.textMuted}
          value={occupation}
          onChangeText={setOccupation}
          onFocus={() => setFocusedField("occupation")}
          onBlur={() => setFocusedField(null)}
          style={[inputBase, focusedField === "occupation" && inputFocused]}
        />

        <Text style={styles.label}>Languages</Text>
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
            borderRadius: theme.radii.md,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            marginBottom: 16,
          }}
        >
          <Text style={{ ...theme.type.body, color: theme.colors.textPrimary, flex: 1 }} numberOfLines={1}>
            {languages.length === 0 ? "Choose languages" : languages.join(", ")}
          </Text>
          <Ionicons name="chevron-down" size={20} color={theme.colors.textSecondary} />
        </Pressable>

        <Modal
          visible={languageModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLanguageModalVisible(false)}
        >
          <Pressable style={{ flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "center", alignItems: "center", padding: 20 }} onPress={() => setLanguageModalVisible(false)}>
            <Pressable style={{ width: "100%", maxWidth: 400, maxHeight: "80%", backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, overflow: "hidden", ...theme.elevation(3) }} onPress={(e) => e.stopPropagation()}>
              <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                <Text style={{ ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, color: theme.colors.textSecondary, marginBottom: 4 }}>Choose languages</Text>
                <Text style={{ ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: 8 }}>Your selections appear first in the list.</Text>
                <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setLanguageModalVisible(false); }} style={{ position: "absolute", top: 16, right: 16, padding: 4 }} hitSlop={12}>
                  <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
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
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 20, backgroundColor: selected ? theme.colors.primary + "18" : "transparent" }}
                    >
                      <Text style={{ ...theme.type.body, color: selected ? theme.colors.primary : theme.colors.textPrimary, fontWeight: selected ? "600" : "400" }} numberOfLines={1}>{lang}</Text>
                      {selected && <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={{ padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <Pressable onPress={() => { Haptics.selectionAsync(); setLanguageModalVisible(false); }} style={{ backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: theme.radii.md, alignItems: "center" }}>
                  <Text style={{ ...theme.type.button, color: theme.colors.onPrimary, fontFamily: theme.type.button.fontFamily }}>Done</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
          <Image source={require("@/assets/icons/Instagram_icon.png")} style={{ width: 16, height: 16, marginRight: 8 }} resizeMode="contain" />
          <Text style={[styles.label, { marginBottom: 0 }]}>Instagram</Text>
        </View>
        <TextInput
          placeholder="@username or instagram.com/username"
          placeholderTextColor={theme.colors.textMuted}
          value={instagram}
          onChangeText={setInstagram}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocusedField("instagram")}
          onBlur={() => setFocusedField(null)}
          style={[inputBase, focusedField === "instagram" && inputFocused, { marginBottom: 16 }]}
        />

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={[styles.label, { marginBottom: 0 }]}>Interests</Text>
          <Text style={{ ...theme.type.caption, color: theme.colors.textMuted }}>{interests.length}/{GENERAL_INTERESTS_MAX}</Text>
        </View>
        <Text style={{ ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: 10 }}>
          Shared across Romance & Friends — pick what you love.
        </Text>
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); setInterestsModalVisible(true); }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 12,
            borderRadius: theme.radii.md,
            borderWidth: 1,
            borderColor: theme.colors.primary,
            backgroundColor: theme.colors.primary + "10",
            marginBottom: interests.length > 0 ? 12 : 4,
          }}
          accessibilityRole="button"
          accessibilityLabel="Choose interests"
        >
          <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} style={{ marginRight: 6 }} />
          <Text style={{ ...theme.type.button, color: theme.colors.primary }}>
            {interests.length > 0 ? "Edit interests" : "Choose interests"}
          </Text>
        </TouchableOpacity>
        {interests.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {interests.map((it) => (
              <TouchableOpacity
                key={it}
                onPress={() => { Haptics.selectionAsync(); setInterests((prev) => prev.filter((x) => x !== it)); }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 20,
                  marginRight: 8,
                  marginBottom: 8,
                  backgroundColor: theme.colors.primary,
                }}
              >
                <Text style={{ fontSize: 14, marginRight: 6 }}>{interestEmoji(it)}</Text>
                <Text style={{ ...theme.type.caption, color: theme.colors.onPrimary }}>{it}</Text>
                <Ionicons name="close-circle" size={15} color={theme.colors.onPrimary} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ))}
          </View>
        )}

          </View>

          <View style={[styles.sectionCard, { marginBottom: 8 }]}>
            <Text style={{ ...theme.type.h3, color: theme.colors.textSecondary, marginBottom: 16, fontFamily: theme.type.h3.fontFamily }}>Mode profiles</Text>
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
          food={foodFriends}
          onFoodChange={setFoodFriends}
          toggleMulti={toggleMulti}
        />
        {isModeAvailable("business") ? (
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
        ) : null}
          </View>

        {saveError ? (
          <View
            style={{
              backgroundColor: theme.colors.errorBg,
              borderRadius: 14,
              padding: 14,
              marginTop: 20,
              borderWidth: 1,
              borderColor: theme.colors.errorBorder,
            }}
          >
            <Text style={{ ...theme.type.body, color: theme.colors.error, fontWeight: "600" as const }}>
              Couldn't save your profile
            </Text>
            <Text style={{ ...theme.type.caption, color: theme.colors.error, marginTop: 4 }}>
              {saveError}
            </Text>
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync(); void handleStepContinue(); }}
              disabled={saving}
              style={{ marginTop: 10, alignSelf: "flex-start" }}
            >
              <Text style={{ ...theme.type.button, color: theme.colors.error, fontWeight: "700" as const }}>
                {saving ? "Retrying…" : "Tap to retry"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ─────── Save ─────── */}
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); void handleStepContinue(); }}
          disabled={saving}
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: 16,
            paddingVertical: 16,
            alignItems: "center",
            marginTop: 28,
            opacity: saving ? 0.6 : 1,
            ...theme.elevation(2),
          }}
        >
          <Text style={{ ...theme.type.button, color: theme.colors.onPrimary, fontFamily: theme.type.button.fontFamily }}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </TouchableOpacity>
              </>
            ) : (
              <WizardShell
                currentStep={currentStepIndex + 1}
                totalSteps={wizardSteps.length}
                stepLabel={wizardStepLabel(currentWizardStep)}
                subProgress={currentWizardStep.kind === "general" && currentWizardStep.id === "photos" ? photoStepSubProgress : undefined}
                onBack={handleHeaderBack}
                onNext={() => { void handleStepContinue(); }}
                nextLabel={currentWizardStep.kind === "review" ? "Finish profile" : "Continue"}
                saving={saving}
                saveError={saveError}
                onRetry={() => { void handleStepContinue(); }}
                autosaveStatus={autosaveStatus}
              >
                {renderWizardStepBody()}
              </WizardShell>
            )}
          </Animated.View>
        </ScrollView>

      <InterestPickerModal
        visible={interestsModalVisible}
        selected={interests}
        onChange={setInterests}
        onClose={() => setInterestsModalVisible(false)}
        max={GENERAL_INTERESTS_MAX}
      />

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

function createStyles(theme: AppTheme) {
  return {
    sectionCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      padding: 20,
      ...theme.elevation(1),
    },

    corePhotoTile: {
      width: "100%" as const,
      aspectRatio: 1,
      borderRadius: 14,
      backgroundColor: theme.colors.backgroundMuted,
      overflow: "hidden" as const,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    corePhotoAddTile: {
      width: "100%" as const,
      aspectRatio: 1,
      borderRadius: 14,
      backgroundColor: theme.colors.backgroundMuted,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      borderWidth: 2,
      borderStyle: "dashed" as const,
      borderColor: theme.colors.border,
    },

    mainBadge: {
      position: "absolute" as const,
      top: 6,
      left: 6,
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      paddingVertical: 2,
      paddingHorizontal: 8,
    },

    mainBadgeText: {
      ...theme.type.caption,
      color: theme.colors.onPrimary,
      fontWeight: "700" as const,
      fontSize: 11,
    },

    removeBadge: {
      position: "absolute" as const,
      top: 6,
      right: 6,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },

    label: {
      ...theme.type.body,
      color: theme.colors.textSecondary,
      marginBottom: 6,
    },

    requiredMark: { color: theme.colors.error, fontWeight: "700" as const },

    headerBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      ...theme.elevation(1),
    },

    suggestionList: {
      borderWidth: 1,
      borderColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.md,
      maxHeight: 200,
      marginBottom: 12,
      backgroundColor: theme.colors.surface,
    },

    suggestionItem: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.backgroundMuted,
    },
  };
}

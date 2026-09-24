// The 5 short "General info" steps of the onboarding wizard (D1).
// Pure presentational components — all state/handlers live in profile-core.tsx.

import React from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Switch, Image, Modal, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { Card } from "@/components/ui/Card";
import { InputField } from "@/components/ui/InputField";
import { Chip } from "@/components/ui/Chip";
import type { CityCountry } from "@/lib/location/citySearch";
import { formatDefaultLocationDisplay } from "@/lib/location/countryDisplay";
import { GENERAL_INTERESTS_MAX, interestEmoji } from "@/constants/interestCategories";
import { MIN_CORE_PHOTOS, MAX_CORE_PHOTOS, MIN_PHOTO_DIMENSION } from "@/lib/profile/validation";
import { useAppLocaleTag } from "@/lib/i18n/appLocale";
import {
  EDUCATION_OPTIONS,
  GENDER_OPTIONS,
  educationLabelKey,
  genderLabelKey,
  optionLabel,
} from "@/lib/profile/coreOptionLabels";

const sectionLabel = { ...Typography.body, color: Colors.gray700, marginBottom: 6 };
const requiredMark = { color: Colors.errorRed, fontWeight: "700" as const };

const corePhotoTile = {
  width: "100%" as const,
  aspectRatio: 1,
  borderRadius: 14,
  backgroundColor: Colors.gray100,
  overflow: "hidden" as const,
  borderWidth: 1,
  borderColor: Colors.gray200,
};

const corePhotoAddTile = {
  width: "100%" as const,
  aspectRatio: 1,
  borderRadius: 14,
  backgroundColor: Colors.gray100,
  justifyContent: "center" as const,
  alignItems: "center" as const,
  borderWidth: 2,
  borderStyle: "dashed" as const,
  borderColor: Colors.gray300,
};

const mainBadge = {
  position: "absolute" as const,
  top: 6,
  left: 6,
  backgroundColor: Colors.primaryViolet,
  borderRadius: 8,
  paddingVertical: 2,
  paddingHorizontal: 8,
};

const mainBadgeText = { ...Typography.caption, color: Colors.white, fontWeight: "700" as const, fontSize: 11 };

const removeBadge = {
  position: "absolute" as const,
  top: 6,
  right: 6,
  width: 24,
  height: 24,
  borderRadius: 12,
  backgroundColor: "rgba(0,0,0,0.55)",
  justifyContent: "center" as const,
  alignItems: "center" as const,
};

export function NameStep(props: {
  firstName: string;
  onFirstNameChange: (v: string) => void;
  lastName: string;
  onLastNameChange: (v: string) => void;
  birthday: Date | null;
  showDatePicker: boolean;
  onShowDatePicker: () => void;
  onDatePickerChange: (date: Date) => void;
  onDatePickerDismiss: () => void;
  maxAdultDate: Date;
}) {
  const { firstName, onFirstNameChange, lastName, onLastNameChange, birthday } = props;
  const { showDatePicker, onShowDatePicker, onDatePickerChange, onDatePickerDismiss, maxAdultDate } = props;
  const { t } = useTranslation();
  const localeTag = useAppLocaleTag();
  return (
    <Card>
      <Text style={{ ...Typography.h3, color: Colors.textSecondary, marginBottom: 4, fontFamily: FontFamily.headingBold }}>
        {t("onboarding.general.basicsTitle")}
      </Text>
      <Text style={{ ...Typography.caption, color: Colors.gray600, marginBottom: 16 }}>
        {t("onboarding.general.basicsSubtitle")}
      </Text>

      <InputField
        label={t("onboarding.general.firstNameRequired")}
        placeholder={t("profile.firstName")}
        value={firstName}
        onChangeText={onFirstNameChange}
      />
      <InputField
        label={t("onboarding.general.lastNameRequired")}
        placeholder={t("profile.lastName")}
        value={lastName}
        onChangeText={onLastNameChange}
      />

      <Text style={sectionLabel}>{t("onboarding.general.birthDate")} <Text style={requiredMark}>*</Text></Text>
      <TouchableOpacity
        onPress={onShowDatePicker}
        style={{
          borderWidth: 1,
          borderColor: Colors.gray200,
          borderRadius: Layout.radii.control,
          paddingHorizontal: 16,
          paddingVertical: 14,
          marginBottom: 12,
          backgroundColor: Colors.backgroundLight,
          justifyContent: "center",
          minHeight: Layout.touchTargetMin,
        }}
      >
        <Text style={{ ...Typography.body, color: birthday ? Colors.textPrimary : Colors.gray500 }}>
          {birthday
            ? birthday.toLocaleDateString(localeTag, { day: "numeric", month: "numeric", year: "numeric" })
            : t("onboarding.general.selectBirthDate")}
        </Text>
      </TouchableOpacity>

      {showDatePicker && (
        <DateTimePicker
          value={birthday || new Date(2000, 0, 1)}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, date) => {
            onDatePickerDismiss();
            if (date) onDatePickerChange(date);
          }}
          maximumDate={maxAdultDate}
        />
      )}

      <Text style={{ ...Typography.caption, color: Colors.gray500 }}>{t("onboarding.general.birthdayPrivate")}</Text>
    </Card>
  );
}

export function PhotosStep(props: {
  corePhotos: string[];
  onOpenPhotoOptions: (index: number) => void;
  onAddPhoto: () => void;
  onRemovePhoto: (index: number) => void;
}) {
  const { corePhotos, onOpenPhotoOptions, onAddPhoto, onRemovePhoto } = props;
  const { t } = useTranslation();
  const missing = MIN_CORE_PHOTOS - corePhotos.length;
  return (
    <Card>
      <Text style={{ ...Typography.h3, color: Colors.textSecondary, marginBottom: 4, fontFamily: FontFamily.headingBold }}>
        {t("onboarding.general.photosTitle")}
      </Text>
      <Text style={{ ...Typography.caption, color: Colors.gray600, marginBottom: 12 }}>
        {t("onboarding.general.photosHint", { min: MIN_CORE_PHOTOS, max: MAX_CORE_PHOTOS, px: MIN_PHOTO_DIMENSION })}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
        <Text style={{ ...Typography.body, color: Colors.gray700 }}>
          {t("onboarding.general.photosRequired", { count: MIN_CORE_PHOTOS, current: corePhotos.length })}
        </Text>
        <Text style={{ ...Typography.caption, color: corePhotos.length >= MIN_CORE_PHOTOS ? Colors.primaryViolet : Colors.errorRed }}>
          {missing <= 0 ? t("onboarding.general.photosReady") : t("onboarding.general.photosMoreNeeded", { count: missing })}
        </Text>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: Colors.gray200, overflow: "hidden", marginBottom: 16 }}>
        <View
          style={{
            height: "100%",
            width: `${Math.min(100, (corePhotos.length / MIN_CORE_PHOTOS) * 100)}%`,
            backgroundColor: corePhotos.length >= MIN_CORE_PHOTOS ? Colors.primaryViolet : Colors.accentYellow,
            borderRadius: 2,
          }}
        />
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 }}>
        {corePhotos.map((uri, i) => (
          <View key={`core-${i}-${uri}`} style={{ width: "33.333%", padding: 6 }}>
            <TouchableOpacity activeOpacity={0.85} onPress={() => onOpenPhotoOptions(i)} style={corePhotoTile}>
              <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
              {i === 0 && (
                <View style={mainBadge}>
                  <Text style={mainBadgeText}>{t("onboarding.photos.main")}</Text>
                </View>
              )}
              <TouchableOpacity
                onPress={() => onRemovePhoto(i)}
                style={removeBadge}
                hitSlop={8}
                accessibilityLabel={t("onboarding.photos.remove")}
              >
                <Ionicons name="close" size={14} color={Colors.white} />
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        ))}
        {corePhotos.length < MAX_CORE_PHOTOS && (
          <View style={{ width: "33.333%", padding: 6 }}>
            <TouchableOpacity onPress={onAddPhoto} style={corePhotoAddTile} accessibilityLabel={t("onboarding.photos.add")}>
              <Ionicons name="add" size={30} color={Colors.primaryViolet} />
              <Text style={{ ...Typography.caption, color: Colors.gray600, marginTop: 4 }}>{t("common.add")}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Card>
  );
}

export function LocationStep(props: {
  city: string;
  onCityChange: (text: string) => void;
  suggestions: CityCountry[];
  cityConfirmed: boolean;
  onSelectCity: (c: CityCountry) => void;
  appLanguage: string;
  onRequestLocation: () => void;
  locationLoading: boolean;
  locationPermissionStatus: "undetermined" | "granted" | "denied";
  gender: string;
  onGenderChange: (v: string) => void;
  showFullName: boolean;
  onShowFullNameChange: (v: boolean) => void;
}) {
  const {
    city, onCityChange, suggestions, cityConfirmed, onSelectCity, appLanguage,
    onRequestLocation, locationLoading, locationPermissionStatus,
    gender, onGenderChange, showFullName, onShowFullNameChange,
  } = props;
  const { t } = useTranslation();
  return (
    <Card>
      <Text style={{ ...Typography.h3, color: Colors.textSecondary, marginBottom: 16, fontFamily: FontFamily.headingBold }}>
        {t("onboarding.general.locationTitle")}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={[sectionLabel, { marginBottom: 0 }]}>{t("profile.city")} <Text style={requiredMark}>*</Text></Text>
        <TouchableOpacity
          onPress={onRequestLocation}
          disabled={locationLoading}
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 16,
            backgroundColor: locationPermissionStatus === "granted" ? Colors.primaryViolet + "15" : Colors.gray200 + "80",
            opacity: locationLoading ? 0.7 : 1,
          }}
        >
          {locationLoading ? (
            <Text style={{ ...Typography.caption, fontWeight: "600", color: Colors.gray600 }}>{t("onboarding.location.getting")}</Text>
          ) : (
            <>
              <Ionicons name="locate" size={16} color={locationPermissionStatus === "granted" ? Colors.primaryViolet : Colors.gray500} style={{ marginRight: 6 }} />
              <Text style={{ ...Typography.caption, fontWeight: "600", color: locationPermissionStatus === "granted" ? Colors.primaryViolet : Colors.gray600 }}>
                {locationPermissionStatus === "denied" ? t("onboarding.location.enable") : t("onboarding.location.useMine")}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      <InputField placeholder={t("onboarding.location.cityPlaceholder")} value={city} onChangeText={onCityChange} />

      {suggestions.length > 0 && !cityConfirmed && (
        <View style={{ borderWidth: 1, borderColor: Colors.gray100, borderRadius: Layout.radii.control, maxHeight: 200, marginBottom: 12, backgroundColor: Colors.white, ...Shadow.card }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {suggestions.map((item) => (
              <TouchableOpacity
                key={`${item.city}-${item.country}`}
                onPress={() => onSelectCity(item)}
                style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray100 }}
              >
                <Text style={{ color: Colors.textPrimary }}>{formatDefaultLocationDisplay(item.city, item.country, appLanguage)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <Text style={[sectionLabel, { marginBottom: 8, marginTop: 4 }]}>{t("profile.gender")} <Text style={requiredMark}>*</Text></Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
        {GENDER_OPTIONS.map((g) => (
          <TouchableOpacity
            key={g}
            onPress={() => onGenderChange(g)}
            style={{
              flex: 1,
              marginHorizontal: 4,
              backgroundColor: gender === g ? Colors.primaryViolet : Colors.white,
              borderWidth: 2,
              borderColor: gender === g ? Colors.primaryViolet : Colors.gray200,
              borderRadius: Layout.radii.control,
              paddingVertical: 12,
              paddingHorizontal: 4,
              alignItems: "center",
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: gender === g }}
          >
            <Text
              style={{ ...Typography.body, color: gender === g ? "#FFF" : Colors.textPrimary, textAlign: "center" }}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {optionLabel(t, genderLabelKey, g)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderWidth: 1,
          borderColor: Colors.gray200,
          borderRadius: Layout.radii.control,
          backgroundColor: Colors.white,
        }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[sectionLabel, { marginBottom: 2 }]}>{t("onboarding.fullName.title")}</Text>
          <Text style={{ ...Typography.caption, color: Colors.gray500 }}>{t("onboarding.fullName.body")}</Text>
        </View>
        <Switch
          value={showFullName}
          onValueChange={onShowFullNameChange}
          trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }}
          thumbColor={Colors.white}
        />
      </View>
    </Card>
  );
}

export function AboutStep(props: {
  education: string;
  onEducationChange: (v: string) => void;
  occupation: string;
  onOccupationChange: (v: string) => void;
  languages: string[];
  onOpenLanguageModal: () => void;
  instagram: string;
  onInstagramChange: (v: string) => void;
  interests: string[];
  onRemoveInterest: (v: string) => void;
  onOpenInterestsModal: () => void;
}) {
  const {
    education, onEducationChange, occupation, onOccupationChange, languages, onOpenLanguageModal,
    instagram, onInstagramChange, interests, onRemoveInterest, onOpenInterestsModal,
  } = props;
  const { t } = useTranslation();
  return (
    <Card>
      <Text style={{ ...Typography.h3, color: Colors.textSecondary, marginBottom: 16, fontFamily: FontFamily.headingBold }}>
        {t("onboarding.general.aboutTitle")}
      </Text>

      <Text style={sectionLabel}>{t("profile.education")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ marginBottom: 16 }} keyboardShouldPersistTaps="handled">
        {EDUCATION_OPTIONS.map((e) => (
          <Chip key={e} label={optionLabel(t, educationLabelKey, e)} selected={education === e} onPress={() => onEducationChange(e)} style={{ marginRight: 8 }} />
        ))}
      </ScrollView>

      <InputField
        label={t("profile.occupation")}
        placeholder={t("onboarding.about.occupationPlaceholder")}
        value={occupation} onChangeText={onOccupationChange} />

      <Text style={sectionLabel}>{t("profile.languages")}</Text>
      <Pressable
        onPress={onOpenLanguageModal}
        accessibilityRole="button"
        accessibilityLabel={t("onboarding.languages.choose")}
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
          {languages.length === 0 ? t("onboarding.languages.choose") : languages.join(", ")}
        </Text>
        <Ionicons name="chevron-down" size={20} color={Colors.gray600} />
      </Pressable>

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
        <Image source={require("@/assets/icons/Instagram_icon.png")} style={{ width: 16, height: 16, marginRight: 8 }} resizeMode="contain" />
        <Text style={[sectionLabel, { marginBottom: 0 }]}>{t("profile.instagram")}</Text>
      </View>
      <InputField
        placeholder={t("onboarding.instagramPlaceholder")}
        value={instagram}
        onChangeText={onInstagramChange}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={[sectionLabel, { marginBottom: 0 }]}>{t("onboarding.interests.label")}</Text>
        <Text style={{ ...Typography.caption, color: Colors.gray500 }}>{interests.length}/{GENERAL_INTERESTS_MAX}</Text>
      </View>
      <Text style={{ ...Typography.caption, color: Colors.gray600, marginBottom: 10 }}>
        {t("onboarding.interests.sharedHint")}
      </Text>
      <TouchableOpacity
        onPress={onOpenInterestsModal}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 12,
          borderRadius: Layout.radii.control,
          borderWidth: 1,
          borderColor: Colors.primaryViolet,
          backgroundColor: Colors.primaryViolet + "10",
          marginBottom: interests.length > 0 ? 12 : 0,
        }}
        accessibilityRole="button"
        accessibilityLabel={t("onboarding.interests.choose")}
      >
        <Ionicons name="add-circle-outline" size={18} color={Colors.primaryViolet} style={{ marginRight: 6 }} />
        <Text style={{ ...Typography.button, color: Colors.primaryViolet }}>
          {interests.length > 0 ? t("onboarding.interests.edit") : t("onboarding.interests.choose")}
        </Text>
      </TouchableOpacity>
      {interests.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {interests.map((it) => (
            <TouchableOpacity
              key={it}
              onPress={() => onRemoveInterest(it)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 20,
                marginRight: 8,
                marginBottom: 8,
                backgroundColor: Colors.primaryViolet,
              }}
            >
              <Text style={{ fontSize: 14, marginRight: 6 }}>{interestEmoji(it)}</Text>
              <Text style={{ ...Typography.caption, color: Colors.white }}>{it}</Text>
              <Ionicons name="close-circle" size={15} color={Colors.white} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </Card>
  );
}

export function LanguageModal(props: {
  visible: boolean;
  languages: string[];
  sortedLanguages: string[];
  onToggleLanguage: (lang: string) => void;
  onClose: () => void;
}) {
  const { visible, languages, sortedLanguages, onToggleLanguage, onClose } = props;
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 20 }} onPress={onClose}>
        <Pressable
          style={{ width: "100%", maxWidth: 400, maxHeight: "80%", backgroundColor: Colors.backgroundLight, borderRadius: Layout.radii.card, overflow: "hidden", ...Shadow.card }}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray200 }}>
            <Text style={{ ...Typography.h3, fontFamily: FontFamily.headingBold, color: Colors.textSecondary, marginBottom: 4 }}>{t("onboarding.languages.choose")}</Text>
            <Text style={{ ...Typography.caption, color: Colors.gray600, marginBottom: 8 }}>{t("onboarding.languages.hint")}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={{ position: "absolute", top: 16, right: 16, padding: 4 }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
            >
              <Ionicons name="close" size={24} color={Colors.gray600} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 320, paddingVertical: 8 }} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
            {sortedLanguages.map((lang) => {
              const selected = languages.includes(lang);
              return (
                <Pressable
                  key={lang}
                  onPress={() => onToggleLanguage(lang)}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 20, backgroundColor: selected ? Colors.primaryViolet + "18" : "transparent" }}
                >
                  <Text style={{ ...Typography.body, color: selected ? Colors.primaryViolet : Colors.textPrimary, fontWeight: selected ? "600" : "400" }} numberOfLines={1}>{lang}</Text>
                  {selected && <Ionicons name="checkmark-circle" size={22} color={Colors.primaryViolet} />}
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ padding: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.gray200 }}>
            <Pressable onPress={onClose} style={{ backgroundColor: Colors.primaryViolet, paddingVertical: 14, borderRadius: Layout.radii.control, alignItems: "center" }}>
              <Text style={{ ...Typography.button, color: Colors.white, fontFamily: FontFamily.headingBold }}>{t("common.done")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

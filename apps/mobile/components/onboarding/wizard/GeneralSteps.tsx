// The 5 short "General info" steps of the onboarding wizard (D1).
// Pure presentational components — all state/handlers live in profile-core.tsx.

import React from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Switch, Image, Modal, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { Card } from "@/components/ui/Card";
import { InputField } from "@/components/ui/InputField";
import { Chip } from "@/components/ui/Chip";
import type { CityCountry } from "@/lib/location/citySearch";
import { formatDefaultLocationDisplay } from "@/lib/location/countryDisplay";
import { GENERAL_INTERESTS_MAX, interestEmoji } from "@/constants/interestCategories";
import { MIN_CORE_PHOTOS, MAX_CORE_PHOTOS, MIN_PHOTO_DIMENSION } from "@/lib/profile/validation";

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
  return (
    <Card>
      <Text style={{ ...Typography.h3, color: Colors.textSecondary, marginBottom: 4, fontFamily: FontFamily.headingBold }}>
        Let&apos;s start with the basics ✨
      </Text>
      <Text style={{ ...Typography.caption, color: Colors.gray600, marginBottom: 16 }}>
        Just the essentials — you can add more details later.
      </Text>

      <InputField label="First name *" placeholder="First name" value={firstName} onChangeText={onFirstNameChange} />
      <InputField label="Last name *" placeholder="Last name" value={lastName} onChangeText={onLastNameChange} />

      <Text style={sectionLabel}>Birth date <Text style={requiredMark}>*</Text></Text>
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
            onDatePickerDismiss();
            if (date) onDatePickerChange(date);
          }}
          maximumDate={maxAdultDate}
        />
      )}

      <Text style={{ ...Typography.caption, color: Colors.gray500 }}>
        Your birthday will remain private — only your age will be visible.
      </Text>
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
  return (
    <Card>
      <Text style={{ ...Typography.h3, color: Colors.textSecondary, marginBottom: 4, fontFamily: FontFamily.headingBold }}>
        Add your photos 📸
      </Text>
      <Text style={{ ...Typography.caption, color: Colors.gray600, marginBottom: 12 }}>
        Add {MIN_CORE_PHOTOS}–{MAX_CORE_PHOTOS} clear photos. Minimum {MIN_PHOTO_DIMENSION}px on the short side — we&apos;ll let you know if one is too small.
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
        <Text style={{ ...Typography.body, color: Colors.gray700 }}>{corePhotos.length} of {MIN_CORE_PHOTOS} required</Text>
        <Text style={{ ...Typography.caption, color: corePhotos.length >= MIN_CORE_PHOTOS ? Colors.primaryViolet : Colors.errorRed }}>
          {corePhotos.length >= MIN_CORE_PHOTOS ? "Ready to continue" : `${MIN_CORE_PHOTOS - corePhotos.length} more needed`}
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
                  <Text style={mainBadgeText}>Main</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => onRemovePhoto(i)} style={removeBadge} hitSlop={8} accessibilityLabel="Remove photo">
                <Ionicons name="close" size={14} color={Colors.white} />
              </TouchableOpacity>
            </TouchableOpacity>
          </View>
        ))}
        {corePhotos.length < MAX_CORE_PHOTOS && (
          <View style={{ width: "33.333%", padding: 6 }}>
            <TouchableOpacity onPress={onAddPhoto} style={corePhotoAddTile} accessibilityLabel="Add photo">
              <Ionicons name="add" size={30} color={Colors.primaryViolet} />
              <Text style={{ ...Typography.caption, color: Colors.gray600, marginTop: 4 }}>Add</Text>
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
  return (
    <Card>
      <Text style={{ ...Typography.h3, color: Colors.textSecondary, marginBottom: 16, fontFamily: FontFamily.headingBold }}>
        Where are you, and who are you? 📍
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={[sectionLabel, { marginBottom: 0 }]}>City <Text style={requiredMark}>*</Text></Text>
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
            <Text style={{ ...Typography.caption, fontWeight: "600", color: Colors.gray600 }}>Getting location…</Text>
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
      <InputField placeholder="e.g. Berlin, London" value={city} onChangeText={onCityChange} />

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

      <Text style={[sectionLabel, { marginBottom: 8, marginTop: 4 }]}>Gender <Text style={requiredMark}>*</Text></Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
        {["Female", "Male", "Other"].map((g) => (
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
              alignItems: "center",
            }}
          >
            <Text style={{ ...Typography.body, color: gender === g ? "#FFF" : Colors.textPrimary }}>{g}</Text>
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
          <Text style={[sectionLabel, { marginBottom: 2 }]}>Show my full name in Romance &amp; Friends</Text>
          <Text style={{ ...Typography.caption, color: Colors.gray500 }}>
            Off by default — others see only your first name on cards and your profile. Business networking always shows your full name.
          </Text>
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

const EDUCATION_OPTIONS = [
  "High school graduate",
  "Bachelor’s degree",
  "Master’s degree",
  "Doctorate / PhD",
  "Other",
];

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
  return (
    <Card>
      <Text style={{ ...Typography.h3, color: Colors.textSecondary, marginBottom: 16, fontFamily: FontFamily.headingBold }}>
        A bit more about you
      </Text>

      <Text style={sectionLabel}>Education</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ marginBottom: 16 }} keyboardShouldPersistTaps="handled">
        {EDUCATION_OPTIONS.map((e) => (
          <Chip key={e} label={e} selected={education === e} onPress={() => onEducationChange(e)} style={{ marginRight: 8 }} />
        ))}
      </ScrollView>

      <InputField label="Occupation" placeholder="What do you do?" value={occupation} onChangeText={onOccupationChange} />

      <Text style={sectionLabel}>Languages</Text>
      <Pressable
        onPress={onOpenLanguageModal}
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

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
        <Image source={require("@/assets/icons/Instagram_icon.png")} style={{ width: 16, height: 16, marginRight: 8 }} resizeMode="contain" />
        <Text style={[sectionLabel, { marginBottom: 0 }]}>Instagram</Text>
      </View>
      <InputField
        placeholder="@username or instagram.com/username"
        value={instagram}
        onChangeText={onInstagramChange}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={[sectionLabel, { marginBottom: 0 }]}>Interests</Text>
        <Text style={{ ...Typography.caption, color: Colors.gray500 }}>{interests.length}/{GENERAL_INTERESTS_MAX}</Text>
      </View>
      <Text style={{ ...Typography.caption, color: Colors.gray600, marginBottom: 10 }}>
        Shared across Romance & Friends — pick what you love.
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
        accessibilityLabel="Choose interests"
      >
        <Ionicons name="add-circle-outline" size={18} color={Colors.primaryViolet} style={{ marginRight: 6 }} />
        <Text style={{ ...Typography.button, color: Colors.primaryViolet }}>
          {interests.length > 0 ? "Edit interests" : "Choose interests"}
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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 20 }} onPress={onClose}>
        <Pressable
          style={{ width: "100%", maxWidth: 400, maxHeight: "80%", backgroundColor: Colors.backgroundLight, borderRadius: Layout.radii.card, overflow: "hidden", ...Shadow.card }}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray200 }}>
            <Text style={{ ...Typography.h3, fontFamily: FontFamily.headingBold, color: Colors.textSecondary, marginBottom: 4 }}>Choose languages</Text>
            <Text style={{ ...Typography.caption, color: Colors.gray600, marginBottom: 8 }}>Your selections appear first in the list.</Text>
            <TouchableOpacity onPress={onClose} style={{ position: "absolute", top: 16, right: 16, padding: 4 }} hitSlop={12}>
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
              <Text style={{ ...Typography.button, color: Colors.white, fontFamily: FontFamily.headingBold }}>Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

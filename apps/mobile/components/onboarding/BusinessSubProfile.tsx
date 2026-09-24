import React from "react";
import { View, Text, TextInput, TouchableOpacity, Switch, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Colors, Typography, Layout } from "@/constants/tokens";
import {
  INTEREST_POPULAR_BUSINESS,
  NETWORKING_GOALS_OPTIONS,
  SKILLS_POPULAR_BUSINESS,
} from "@/constants/profileOptions";
import { InterestSelect } from "./InterestSelect";

const inputStyle = {
  borderWidth: 1,
  borderColor: Colors.gray400,
  borderRadius: Layout.radii.control,
  padding: 12,
  backgroundColor: "#FFF",
  marginBottom: 12,
};

const label = { ...Typography.body, color: Colors.gray700, marginBottom: 6 };
const requiredMark = { color: Colors.errorRed, fontWeight: "700" as const };

function ChipSelect({ options, selected, onToggle, max }: { options: string[]; selected: string[]; onToggle: (v: string) => void; max?: number }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 12 }}>
      {options.map((o) => {
        const isSelected = selected.includes(o);
        const canAdd = !max || selected.length < max || isSelected;
        return (
          <TouchableOpacity
            key={o}
            onPress={() => canAdd && onToggle(o)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 20,
              marginRight: 8,
              marginBottom: 8,
              backgroundColor: isSelected ? Colors.primaryViolet : Colors.gray100,
            }}
          >
            <Text style={{ ...Typography.caption, color: isSelected ? "#FFF" : Colors.textPrimary }}>{o}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function BusinessSubProfile(props: {
  enabled: boolean;
  toggle: () => void;
  photos: (string | null)[];
  onPickPhoto: (i: number) => void;
  video: string | null;
  onPickVideo: () => void;
  bio: string;
  onBioChange: (v: string) => void;
  role: string;
  onRoleChange: (v: string) => void;
  company: string;
  onCompanyChange: (v: string) => void;
  area: string;
  onAreaChange: (v: string) => void;
  networkingGoals: string[];
  onNetworkingGoalsChange: (v: string[]) => void;
  skills: string[];
  onSkillsChange: (v: string[]) => void;
  interests: string[];
  onInterestsChange: (v: string[]) => void;
  instagram: string;
  onInstagramChange: (v: string) => void;
  toggleMulti: (arr: string[], val: string, setter: (v: string[]) => void, max: number) => void;
  hideToggle?: boolean;
  /** When set, only that section's fields render (used by the onboarding wizard's short steps). Omit to render everything (edit flow). */
  section?: "photosBio" | "details" | "goals";
  /** When rendering a single section for the wizard, hide the repeated "💼 Business" header row. */
  hideHeader?: boolean;
}) {
  const { t } = useTranslation();
  const { enabled, toggle, photos, onPickPhoto, video, onPickVideo, bio, onBioChange, hideToggle, section, hideHeader } = props;
  const { role, onRoleChange, company, onCompanyChange, area, onAreaChange } = props;
  const { networkingGoals, onNetworkingGoalsChange, skills, onSkillsChange } = props;
  const { interests, onInterestsChange, instagram, onInstagramChange, toggleMulti } = props;
  const showPhotosBio = !section || section === "photosBio";
  const showDetails = !section || section === "details";
  const showGoals = !section || section === "goals";

  if (!enabled) {
    return (
      <View style={{ marginBottom: 28 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>💼 {t("modes.business")}</Text>
          {!hideToggle && <Switch value={enabled} onValueChange={toggle} trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }} thumbColor={Colors.white} />}
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 28 }}>
      {!hideHeader && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>💼 {t("modes.business")}</Text>
          {!hideToggle && <Switch value={enabled} onValueChange={toggle} trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }} thumbColor={Colors.white} />}
        </View>
      )}

      {showPhotosBio && (
      <>
      <Text style={label}>{t("profile.photos")} <Text style={requiredMark}>*</Text></Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
        {photos.map((p, i) => {
          const isFirst = i === 0;
          const frameStyle = isFirst ? { borderWidth: 3, borderColor: Colors.business.primary } : {};
          return (
            <TouchableOpacity
              key={i}
              onPress={() => onPickPhoto(i)}
              style={{
                width: 100,
                height: 100,
                borderRadius: 12,
                backgroundColor: Colors.gray100,
                justifyContent: "center",
                alignItems: "center",
                overflow: "hidden",
                marginRight: 8,
                marginBottom: 8,
                ...frameStyle,
              }}
            >
              {p ? <Image source={{ uri: p }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : <Text style={{ fontSize: 28, color: Colors.gray400 }}>＋</Text>}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={onPickVideo}
          style={{ width: 100, height: 100, borderRadius: 12, backgroundColor: Colors.gray100, justifyContent: "center", alignItems: "center", marginRight: 8, marginBottom: 8 }}
        >
          {video ? <Ionicons name="videocam" size={32} color={Colors.primaryViolet} /> : <Ionicons name="videocam-outline" size={28} color={Colors.gray400} />}
          <Text style={{ ...Typography.caption, color: Colors.gray500, marginTop: 4 }}>{t("onboarding.subProfile.video")}</Text>
        </TouchableOpacity>
      </View>

      <Text style={label}>{t("profile.bio")} <Text style={requiredMark}>*</Text></Text>
      <TextInput placeholder={t("onboarding.subProfile.business.bioPlaceholder")} value={bio} onChangeText={onBioChange} multiline style={[inputStyle, { height: 100, textAlignVertical: "top" }]} placeholderTextColor={Colors.gray500} />
      </>
      )}

      {showDetails && (
      <>
      <Text style={label}>{t("onboarding.subProfile.business.role")}</Text>
      <TextInput placeholder={t("onboarding.subProfile.business.rolePlaceholder")} value={role} onChangeText={onRoleChange} style={inputStyle} placeholderTextColor={Colors.gray500} />

      <Text style={label}>{t("onboarding.subProfile.business.company")}</Text>
      <TextInput placeholder={t("onboarding.subProfile.business.companyPlaceholder")} value={company} onChangeText={onCompanyChange} style={inputStyle} placeholderTextColor={Colors.gray500} />

      <Text style={label}>{t("onboarding.subProfile.business.area")}</Text>
      <TextInput placeholder={t("onboarding.subProfile.business.areaPlaceholder")} value={area} onChangeText={onAreaChange} style={inputStyle} placeholderTextColor={Colors.gray500} />

      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
        <Image source={require("@/assets/icons/Instagram_icon.png")} style={{ width: 16, height: 16, marginRight: 8 }} resizeMode="contain" />
        <Text style={[label, { marginBottom: 0 }]}>{t("onboarding.subProfile.business.instagram")}</Text>
      </View>
      <TextInput
        placeholder={t("onboarding.instagramPlaceholder")}
        placeholderTextColor={Colors.gray500}
        value={instagram}
        onChangeText={onInstagramChange}
        autoCapitalize="none"
        autoCorrect={false}
        style={inputStyle}
      />
      </>
      )}

      {showGoals && (
      <>
      <Text style={label}>
        {t("onboarding.subProfile.business.networkingGoals", { count: 3 })} <Text style={requiredMark}>*</Text>
      </Text>
      <ChipSelect
        options={NETWORKING_GOALS_OPTIONS}
        selected={networkingGoals}
        onToggle={(v) => toggleMulti(networkingGoals, v, onNetworkingGoalsChange, 3)}
        max={3}
      />

      <Text style={label}>{t("onboarding.subProfile.business.skills", { count: 5 })}</Text>
      <InterestSelect
        popularOptions={SKILLS_POPULAR_BUSINESS}
        selected={skills}
        onChange={onSkillsChange}
        max={5}
        placeholder={t("onboarding.subProfile.business.skillPlaceholder")}
      />

      <Text style={label}>{t("onboarding.subProfile.business.interests")}</Text>
      <InterestSelect
        popularOptions={INTEREST_POPULAR_BUSINESS}
        selected={interests}
        onChange={onInterestsChange}
        max={5}
        placeholder={t("onboarding.subProfile.business.interestPlaceholder")}
      />
      </>
      )}
    </View>
  );
}

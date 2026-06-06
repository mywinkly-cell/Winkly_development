import React from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Switch, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import {
  LIFESTYLE_ROMANCE,
  SMOKING_OPTIONS,
  ALCOHOL_OPTIONS,
  MEETUP_GOALS_OPTIONS,
  STATUS_OPTIONS,
  KIDS_FRIENDS_OPTIONS,
  PETS_OPTIONS,
  ALLERGIES_OPTIONS,
  FOOD_OPTIONS,
  INTEREST_POPULAR_FRIENDS,
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

function ChipSelect({ options, selected, onToggle, max, exclusiveOption }: { options: string[]; selected: string[]; onToggle: (v: string) => void; max?: number; exclusiveOption?: string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 12 }}>
      {options.map((o) => {
        const isSelected = selected.includes(o);
        const canToggle = exclusiveOption ? (o === exclusiveOption ? true : !selected.includes(exclusiveOption) && (!max || selected.length < max || isSelected)) : !max || selected.length < max || isSelected;
        return (
          <TouchableOpacity
            key={o}
            onPress={() => canToggle && onToggle(o)}
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

function SingleSelect({ options, selected, onSelect, label: lbl }: { options: string[]; selected: string; onSelect: (v: string) => void; label: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={label}>{lbl}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
        {options.map((o) => (
          <TouchableOpacity
            key={o}
            onPress={() => onSelect(o)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 20,
              marginRight: 8,
              backgroundColor: selected === o ? Colors.primaryViolet : Colors.gray100,
            }}
          >
            <Text style={{ ...Typography.caption, color: selected === o ? "#FFF" : Colors.textPrimary }}>{o}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export function FriendsSubProfile(props: {
  enabled: boolean;
  toggle: () => void;
  photos: (string | null)[];
  onPickPhoto: (i: number) => void;
  video: string | null;
  onPickVideo: () => void;
  bio: string;
  onBioChange: (v: string) => void;
  interests: string[];
  onInterestsChange: (v: string[]) => void;
  lifestyle: string;
  onLifestyleChange: (v: string) => void;
  alcohol: string;
  onAlcoholChange: (v: string) => void;
  smoking: string;
  onSmokingChange: (v: string) => void;
  meetupGoals: string[];
  onMeetupGoalsChange: (v: string[]) => void;
  status: string;
  onStatusChange: (v: string) => void;
  kids: string;
  onKidsChange: (v: string) => void;
  pets: string[];
  onPetsChange: (v: string[]) => void;
  allergies: string[];
  onAllergiesChange: (v: string[]) => void;
  food: string;
  onFoodChange: (v: string) => void;
  toggleMulti: (arr: string[], val: string, setter: (v: string[]) => void, max: number) => void;
  onAllergiesToggle?: (v: string) => void;
  onPetsToggle?: (v: string) => void;
  hideToggle?: boolean;
}) {
  const { enabled, toggle, photos, onPickPhoto, video, onPickVideo, bio, onBioChange, hideToggle } = props;
  const { interests, onInterestsChange, lifestyle, onLifestyleChange, alcohol, onAlcoholChange, smoking, onSmokingChange } = props;
  const { meetupGoals, onMeetupGoalsChange, status, onStatusChange, kids, onKidsChange, pets, onPetsChange, allergies, onAllergiesChange, food, onFoodChange, toggleMulti, onAllergiesToggle, onPetsToggle } = props;

  if (!enabled) {
    return (
      <View style={{ marginBottom: 28 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>👥 Friends</Text>
          {!hideToggle && <Switch value={enabled} onValueChange={toggle} trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }} thumbColor={Colors.white} />}
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>👥 Friends</Text>
        {!hideToggle && <Switch value={enabled} onValueChange={toggle} trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }} thumbColor={Colors.white} />}
      </View>

      <Text style={label}>Photos <Text style={requiredMark}>*</Text></Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
        {photos.map((p, i) => {
          const isFirst = i === 0;
          const frameStyle = isFirst ? { borderWidth: 3, borderColor: Colors.friends.primary } : {};
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
          <Text style={{ ...Typography.caption, color: Colors.gray500, marginTop: 4 }}>Video</Text>
        </TouchableOpacity>
      </View>

      <Text style={label}>Bio <Text style={requiredMark}>*</Text></Text>
      <TextInput placeholder="What kind of friendships do you enjoy?" value={bio} onChangeText={onBioChange} multiline style={[inputStyle, { height: 100, textAlignVertical: "top" }]} placeholderTextColor={Colors.gray500} />

      <Text style={label}>Interests</Text>
      <InterestSelect
        popularOptions={INTEREST_POPULAR_FRIENDS}
        selected={interests}
        onChange={onInterestsChange}
        max={8}
      />

      <SingleSelect options={LIFESTYLE_ROMANCE} selected={lifestyle} onSelect={onLifestyleChange} label="Lifestyle" />
      <SingleSelect options={ALCOHOL_OPTIONS} selected={alcohol} onSelect={onAlcoholChange} label="Alcohol" />
      <SingleSelect options={SMOKING_OPTIONS} selected={smoking} onSelect={onSmokingChange} label="Smoking" />
      <Text style={label}>Meetup goals (up to 3) <Text style={requiredMark}>*</Text></Text>
      <ChipSelect options={MEETUP_GOALS_OPTIONS} selected={meetupGoals} onToggle={(v) => toggleMulti(meetupGoals, v, onMeetupGoalsChange, 3)} />
      <SingleSelect options={STATUS_OPTIONS} selected={status} onSelect={onStatusChange} label="Status" />
      <SingleSelect options={KIDS_FRIENDS_OPTIONS} selected={kids} onSelect={onKidsChange} label="Kids" />
      <Text style={label}>Pets (up to 2)</Text>
      <ChipSelect
        options={PETS_OPTIONS}
        selected={pets}
        onToggle={onPetsToggle ?? ((v) => toggleMulti(pets, v, onPetsChange, 2))}
        max={2}
        exclusiveOption="No pets"
      />
      <Text style={label}>Allergies (up to 3)</Text>
      <ChipSelect
        options={ALLERGIES_OPTIONS}
        selected={allergies}
        onToggle={onAllergiesToggle ?? ((v) => toggleMulti(allergies, v, onAllergiesChange, 3))}
        max={3}
        exclusiveOption="None"
      />
      <SingleSelect options={FOOD_OPTIONS} selected={food} onSelect={onFoodChange} label="Food habits" />
    </View>
  );
}

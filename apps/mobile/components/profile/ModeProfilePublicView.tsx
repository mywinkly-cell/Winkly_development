import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { interestEmoji } from "@/constants/interestCategories";
import { ProfilePhotoCarousel } from "@/components/profile/ProfilePhotoCarousel";
import {
  ProfileChipList,
  ProfileInstagramLink,
  ProfileSection,
} from "@/components/profile/OtherUserProfileSections";
import {
  ageForPublicCoreProfile,
  displayNameForPublicModeProfile,
  metaStringArray,
  photosForPublicModeProfile,
  type PublicCoreProfile,
  type PublicModeProfileRow,
  type PublicProfileMode,
} from "@/lib/profile/publicModeProfile";
type ModeProfilePublicViewProps = {
  mode: PublicProfileMode;
  core: PublicCoreProfile;
  modeRow: PublicModeProfileRow | null;
  locale?: string;
  /** Own preview only — explains name privacy to the profile owner. */
  showPrivacyHints?: boolean;
  /** Optional slot beside the name row (e.g. Romance AI match badge). */
  nameAccessory?: React.ReactNode;
  /** Optional content after About you basics (e.g. Romance AI tags). */
  aboutYouExtra?: React.ReactNode;
  modeColor?: string;
};

function metaLine(label: string, value: string | null | undefined) {
  const v = (value ?? "").trim();
  if (!v) return null;
  return (
    <View style={styles.metaRow} key={label}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{v}</Text>
    </View>
  );
}

function metaChips(title: string, items: string[]) {
  if (items.length === 0) return null;
  return (
    <ProfileSection title={title}>
      <ProfileChipList items={items} />
    </ProfileSection>
  );
}

const MODE_COLORS: Record<PublicProfileMode, string> = {
  romance: Colors.romance.primary,
  friends: Colors.friends.primary,
  business: Colors.business.primary,
  events: Colors.events.primary,
};

/**
 * Canonical public profile body — must match the owner's `/profile/view-profile`
 * preview for the same mode so cards, chats, planner, and discovery all agree.
 */
export function ModeProfilePublicView({
  mode,
  core,
  modeRow,
  locale = "en",
  showPrivacyHints = false,
  nameAccessory,
  aboutYouExtra,
  modeColor,
}: ModeProfilePublicViewProps) {
  const borderColor = (modeColor ?? MODE_COLORS[mode]) + "40";
  const displayName = displayNameForPublicModeProfile(mode, core);
  const age = ageForPublicCoreProfile(core);
  const city = core.city ? normalizeLocationDisplayString(core.city, locale) : "";
  const photos = useMemo(
    () => photosForPublicModeProfile(mode, core, modeRow),
    [mode, core, modeRow]
  );
  const activeMeta = modeRow?.meta ?? {};
  const modeBio = modeRow?.bio ?? "";

  const showFullMoreAboutYou =
    mode === "romance" || mode === "friends" || mode === "events";
  const showBusinessGeneralExtras = mode === "business";

  return (
    <>
      <ProfilePhotoCarousel photos={photos} />

      <View style={[styles.card, { borderColor }]}>
        <Text style={styles.sectionTitle}>About you</Text>
        <View style={styles.nameRow}>
          <View style={styles.nameBlock}>
            <Text style={styles.nameAge}>
              {displayName}
              {age != null ? `, ${age}` : ""}
            </Text>
            {showPrivacyHints && mode !== "business" && core.last_name ? (
              <Text style={styles.privacyHint}>
                {core.show_full_name
                  ? "Others see your full name in this mode."
                  : "Others see only your first name in this mode."}
              </Text>
            ) : null}
          </View>
          {nameAccessory ?? null}
        </View>
        {core.gender ? <Text style={styles.meta}>{core.gender}</Text> : null}
        {city ? <Text style={styles.meta}>{city}</Text> : null}
        {showFullMoreAboutYou && core.occupation ? (
          <Text style={styles.meta}>{core.occupation}</Text>
        ) : null}
        {aboutYouExtra ?? null}

        {showFullMoreAboutYou &&
        (core.education ||
          core.languages.length > 0 ||
          core.instagram ||
          core.interests.length > 0 ||
          typeof core.night_owl === "boolean") ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionGap]}>More about you</Text>
            {core.education ? (
              <Text style={styles.bodyLine}>Education: {core.education}</Text>
            ) : null}
            {core.languages.length > 0 ? (
              <Text style={styles.bodyLine}>Languages: {core.languages.join(", ")}</Text>
            ) : null}
            {typeof core.night_owl === "boolean" ? (
              <Text style={styles.bodyLine}>
                {core.night_owl ? "Night owl" : "Early bird"}
              </Text>
            ) : null}
            {core.interests.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.subheading}>Interests</Text>
                <View style={styles.interestRow}>
                  {core.interests.map((it) => (
                    <View key={it} style={styles.interestChip}>
                      <Text style={styles.interestEmoji}>{interestEmoji(it)}</Text>
                      <Text style={styles.interestText}>{it}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {core.instagram ? (
              <View style={{ marginTop: 12 }}>
                <ProfileInstagramLink handle={core.instagram} />
              </View>
            ) : null}
          </>
        ) : null}

        {showBusinessGeneralExtras &&
        (core.education || core.languages.length > 0 || core.instagram) ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionGap]}>More about you</Text>
            {core.education ? (
              <Text style={styles.bodyLine}>Education: {core.education}</Text>
            ) : null}
            {core.languages.length > 0 ? (
              <Text style={styles.bodyLine}>Languages: {core.languages.join(", ")}</Text>
            ) : null}
            {core.instagram ? (
              <View style={{ marginTop: 12 }}>
                <ProfileInstagramLink handle={core.instagram} />
              </View>
            ) : null}
          </>
        ) : null}

        {mode === "romance" && modeRow ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionGap]}>Romance</Text>
            {modeBio ? (
              <Text style={styles.body}>{modeBio}</Text>
            ) : (
              <Text style={styles.emptyHint}>No romance bio yet.</Text>
            )}
            {metaChips("Relationship goals", metaStringArray(activeMeta, "relationship_goals"))}
            {metaLine("Height", String(activeMeta.height ?? ""))}
            {metaLine("Weight", String(activeMeta.weight ?? ""))}
            {metaLine("Lifestyle", String(activeMeta.lifestyle ?? ""))}
            {metaLine("Smoking", String(activeMeta.smoking ?? ""))}
            {metaLine("Alcohol", String(activeMeta.alcohol ?? ""))}
            {metaLine("Kids", String(activeMeta.kids ?? ""))}
            {metaLine("Sexual orientation", String(activeMeta.sexual_views ?? ""))}
            {metaLine("Religion", String(activeMeta.religion ?? ""))}
            {metaLine("Political views", String(activeMeta.political_views ?? ""))}
            {metaLine("Food habits", String(activeMeta.food ?? ""))}
            {metaChips("Values", metaStringArray(activeMeta, "values"))}
            {metaChips("Pets", metaStringArray(activeMeta, "pets"))}
            {metaChips("Allergies", metaStringArray(activeMeta, "allergies"))}
            {metaChips("Lifestyle tags", modeRow.lifestyle_tags)}
          </>
        ) : null}

        {mode === "friends" && modeRow ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionGap]}>Friends</Text>
            {modeBio ? (
              <Text style={styles.body}>{modeBio}</Text>
            ) : (
              <Text style={styles.emptyHint}>No friends bio yet.</Text>
            )}
            {metaChips("Meetup goals", metaStringArray(activeMeta, "meetup_goals"))}
            {metaChips("Vibe tags", metaStringArray(activeMeta, "vibe_tags"))}
            {metaLine("Lifestyle", String(activeMeta.lifestyle ?? ""))}
            {metaLine("Alcohol", String(activeMeta.alcohol ?? ""))}
            {metaLine("Smoking", String(activeMeta.smoking ?? ""))}
            {metaLine("Status", String(activeMeta.status ?? ""))}
            {metaLine("Kids", String(activeMeta.kids ?? ""))}
            {metaLine("Food habits", String(activeMeta.food ?? ""))}
            {metaChips("Pets", metaStringArray(activeMeta, "pets"))}
            {metaChips("Allergies", metaStringArray(activeMeta, "allergies"))}
          </>
        ) : null}

        {mode === "business" && modeRow ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionGap]}>Business</Text>
            {modeBio ? (
              <Text style={styles.body}>{modeBio}</Text>
            ) : (
              <Text style={styles.emptyHint}>No business bio yet.</Text>
            )}
            {metaLine("Role", String(activeMeta.role ?? ""))}
            {metaLine("Company", String(activeMeta.company ?? ""))}
            {metaLine("Industry", String(activeMeta.area ?? ""))}
            {metaChips("Networking goals", metaStringArray(activeMeta, "networking_goals"))}
            {metaChips("Skills", metaStringArray(activeMeta, "skills"))}
            {metaChips("Professional interests", modeRow.interests)}
            {String(activeMeta.instagram ?? "").trim() ? (
              <View style={{ marginTop: 12 }}>
                <ProfileSection title="Instagram (business)">
                  <ProfileInstagramLink handle={String(activeMeta.instagram)} />
                </ProfileSection>
              </View>
            ) : null}
          </>
        ) : null}

        {showPrivacyHints && mode === "events" ? (
          <Text style={[styles.eventsNote, styles.sectionGap]}>
            In Events mode others see your general profile only — no mode sub-profile.
          </Text>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: Layout.radii.card,
    backgroundColor: Colors.white,
    borderWidth: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  nameBlock: { flex: 1 },
  nameAge: {
    ...Typography.h2,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
  },
  privacyHint: { ...Typography.caption, color: Colors.gray500, marginTop: 4 },
  meta: { ...Typography.body, color: Colors.gray600, marginBottom: 4 },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  sectionGap: { marginTop: 16 },
  subheading: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.gray700,
    marginBottom: 6,
  },
  body: { ...Typography.body, color: Colors.gray700, lineHeight: 22 },
  bodyLine: { ...Typography.body, color: Colors.gray700, lineHeight: 22, marginBottom: 4 },
  emptyHint: { ...Typography.caption, color: Colors.gray500 },
  eventsNote: {
    ...Typography.caption,
    color: Colors.gray600,
    fontStyle: "italic",
  },
  metaRow: {
    flexDirection: "row",
    marginTop: 8,
    gap: 10,
  },
  metaLabel: {
    ...Typography.caption,
    color: Colors.gray500,
    width: 120,
  },
  metaValue: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  interestRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  interestChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  interestEmoji: { fontSize: 14, marginRight: 4 },
  interestText: { ...Typography.caption, color: Colors.textPrimary },
});

import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
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

function metaLine(label: string, value: string | null | undefined, styles: ReturnType<typeof createStyles>) {
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

function modeColors(theme: AppTheme): Record<PublicProfileMode, string> {
  return {
    romance: theme.modeAccent("romance").primary,
    friends: theme.modeAccent("friends").primary,
    business: theme.modeAccent("business").primary,
    events: theme.modeAccent("events").primary,
  };
}

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
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const borderColor = (modeColor ?? modeColors(theme)[mode]) + "40";
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
              <View style={{ marginTop: theme.spacing.md }}>
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
              <View style={{ marginTop: theme.spacing.md }}>
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
              <View style={{ marginTop: theme.spacing.md }}>
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
            {metaLine("Height", String(activeMeta.height ?? ""), styles)}
            {metaLine("Weight", String(activeMeta.weight ?? ""), styles)}
            {metaLine("Lifestyle", String(activeMeta.lifestyle ?? ""), styles)}
            {metaLine("Smoking", String(activeMeta.smoking ?? ""), styles)}
            {metaLine("Alcohol", String(activeMeta.alcohol ?? ""), styles)}
            {metaLine("Kids", String(activeMeta.kids ?? ""), styles)}
            {metaLine("Sexual orientation", String(activeMeta.sexual_views ?? ""), styles)}
            {metaLine("Religion", String(activeMeta.religion ?? ""), styles)}
            {metaLine("Political views", String(activeMeta.political_views ?? ""), styles)}
            {metaLine("Food habits", String(activeMeta.food ?? ""), styles)}
            {metaChips("Values", metaStringArray(activeMeta, "values"))}
            {metaChips("Pets", metaStringArray(activeMeta, "pets"))}
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
            {metaLine("Lifestyle", String(activeMeta.lifestyle ?? ""), styles)}
            {metaLine("Alcohol", String(activeMeta.alcohol ?? ""), styles)}
            {metaLine("Smoking", String(activeMeta.smoking ?? ""), styles)}
            {metaLine("Status", String(activeMeta.status ?? ""), styles)}
            {metaLine("Kids", String(activeMeta.kids ?? ""), styles)}
            {metaLine("Food habits", String(activeMeta.food ?? ""), styles)}
            {metaChips("Pets", metaStringArray(activeMeta, "pets"))}
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
            {metaLine("Role", String(activeMeta.role ?? ""), styles)}
            {metaLine("Company", String(activeMeta.company ?? ""), styles)}
            {metaLine("Industry", String(activeMeta.area ?? ""), styles)}
            {metaChips("Networking goals", metaStringArray(activeMeta, "networking_goals"))}
            {metaChips("Skills", metaStringArray(activeMeta, "skills"))}
            {metaChips("Professional interests", modeRow.interests)}
            {String(activeMeta.instagram ?? "").trim() ? (
              <View style={{ marginTop: theme.spacing.md }}>
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

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    card: {
      marginHorizontal: theme.spacing.xl,
      marginTop: theme.spacing.lg,
      padding: theme.spacing.lg,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 2,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.xxs,
    },
    nameBlock: { flex: 1 },
    nameAge: {
      ...theme.type.h2,
      fontFamily: theme.type.h2.fontFamily,
      color: theme.colors.textPrimary,
    },
    privacyHint: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textMuted, marginTop: theme.spacing.xxs },
    meta: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.xxs },
    sectionTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.sm,
    },
    sectionGap: { marginTop: theme.spacing.lg },
    subheading: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontWeight: "700",
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xs,
    },
    body: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary },
    bodyLine: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.xxs },
    emptyHint: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textMuted },
    eventsNote: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      fontStyle: "italic",
    },
    metaRow: {
      flexDirection: "row",
      marginTop: theme.spacing.sm,
      gap: theme.spacing.sm,
    },
    metaLabel: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textMuted,
      width: 120,
    },
    metaValue: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textPrimary,
      flex: 1,
    },
    interestRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
    },
    interestChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.backgroundMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    interestEmoji: { fontSize: 14, marginRight: theme.spacing.xxs },
    interestText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textPrimary },
  });
}

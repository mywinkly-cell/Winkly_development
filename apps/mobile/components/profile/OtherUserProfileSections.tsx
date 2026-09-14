import React from "react";
import { View, Text, ScrollView, Image, StyleSheet, Dimensions } from "react-native";
import * as Linking from "expo-linking";
import { TouchableOpacity } from "react-native";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type ChipProps = { items: string[] };

export function ProfileChipList({ items }: ChipProps) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  if (items.length === 0) return null;
  return (
    <View style={styles.chipWrap}>
      {items.map((item) => (
        <View key={item} style={styles.chip}>
          <Text style={styles.chipText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function ProfileSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function ProfilePhotoGallery({ photos }: { photos: string[] }) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const topPhoto = photos[0] ?? null;
  if (!topPhoto && photos.length === 0) {
    return (
      <View style={styles.heroPhoto}>
        <Text style={{ fontSize: 40 }}>📷</Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.heroPhoto}>
        {topPhoto ? (
          <Image source={{ uri: topPhoto }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: 40 }}>📷</Text>
        )}
      </View>
      {photos.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.galleryScroll}
          contentContainerStyle={styles.galleryContent}
        >
          {photos.slice(1).map((uri) => (
            <View key={uri} style={styles.galleryThumb}>
              <Image source={{ uri }} style={styles.galleryThumbImage} resizeMode="cover" />
            </View>
          ))}
        </ScrollView>
      ) : null}
    </>
  );
}

export function ProfileInstagramLink({ handle }: { handle: string }) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const trimmed = handle.trim();
  if (!trimmed) return null;
  const h = trimmed.replace(/^@/, "").replace(/.*instagram\.com\//, "").split("/")[0];
  const label = trimmed.startsWith("http")
    ? trimmed
    : `instagram.com/${trimmed.replace(/^@/, "")}`;

  return (
    <ProfileSection title="Instagram">
      <TouchableOpacity
        onPress={() => {
          if (h) Linking.openURL(`https://instagram.com/${h}`);
        }}
      >
        <Text style={styles.link}>{label}</Text>
      </TouchableOpacity>
    </ProfileSection>
  );
}

export function ProfileGeneralBlock({
  coreBio,
  education,
  languages,
  nightOwl,
}: {
  coreBio?: string | null;
  education?: string | null;
  languages?: string[];
  nightOwl?: boolean | null;
}) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const hasGeneral =
    !!coreBio ||
    !!education ||
    (languages?.length ?? 0) > 0 ||
    typeof nightOwl === "boolean";

  if (!hasGeneral) return null;

  return (
    <ProfileSection title="General">
      {coreBio ? <Text style={styles.body}>{coreBio}</Text> : null}
      {education ? (
        <Text style={[styles.metaLine, coreBio ? { marginTop: theme.spacing.sm } : null]}>
          Education: {education}
        </Text>
      ) : null}
      {typeof nightOwl === "boolean" ? (
        <Text style={styles.metaLine}>{nightOwl ? "Night owl" : "Early bird"}</Text>
      ) : null}
      {languages && languages.length > 0 ? (
        <>
          <Text style={[styles.subheading, { marginTop: theme.spacing.md }]}>Languages</Text>
          <Text style={styles.body}>{languages.join(", ")}</Text>
        </>
      ) : null}
    </ProfileSection>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    heroPhoto: {
      width: SCREEN_WIDTH,
      height: SCREEN_WIDTH * 1.1,
      backgroundColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    heroImage: { width: "100%", height: "100%" },
    galleryScroll: { marginTop: theme.spacing.md },
    galleryContent: {
      paddingHorizontal: theme.spacing.xl,
      gap: theme.spacing.sm,
      paddingRight: theme.spacing.xl,
    },
    galleryThumb: {
      width: 90,
      height: 120,
      borderRadius: theme.radii.lg,
      overflow: "hidden",
      backgroundColor: theme.colors.border,
    },
    galleryThumbImage: { width: "100%", height: "100%" },
    section: { marginBottom: theme.spacing.lg },
    sectionTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.xs,
    },
    subheading: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontWeight: "700",
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xxs,
    },
    body: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
    },
    metaLine: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
    },
    chipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xxs,
    },
    chip: {
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.backgroundMuted,
      paddingVertical: theme.spacing.xxs,
      paddingHorizontal: theme.spacing.sm,
    },
    chipText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textPrimary,
    },
    link: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.primary,
      textDecorationLine: "underline",
    },
  });
}

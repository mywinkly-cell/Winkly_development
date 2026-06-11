import React from "react";
import { View, Text, ScrollView, Image, StyleSheet, Dimensions } from "react-native";
import * as Linking from "expo-linking";
import { TouchableOpacity } from "react-native";
import { Colors, Typography, Layout } from "@/constants/tokens";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type ChipProps = { items: string[] };

export function ProfileChipList({ items }: ChipProps) {
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
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function ProfilePhotoGallery({ photos }: { photos: string[] }) {
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
        <Text style={[styles.metaLine, coreBio ? { marginTop: 10 } : null]}>
          Education: {education}
        </Text>
      ) : null}
      {typeof nightOwl === "boolean" ? (
        <Text style={styles.metaLine}>{nightOwl ? "Night owl" : "Early bird"}</Text>
      ) : null}
      {languages && languages.length > 0 ? (
        <>
          <Text style={[styles.subheading, { marginTop: 12 }]}>Languages</Text>
          <Text style={styles.body}>{languages.join(", ")}</Text>
        </>
      ) : null}
    </ProfileSection>
  );
}

const styles = StyleSheet.create({
  heroPhoto: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.1,
    backgroundColor: Colors.gray200,
    alignItems: "center",
    justifyContent: "center",
  },
  heroImage: { width: "100%", height: "100%" },
  galleryScroll: { marginTop: 12 },
  galleryContent: {
    paddingHorizontal: Layout.screenPadding,
    gap: 10,
    paddingRight: Layout.screenPadding,
  },
  galleryThumb: {
    width: 90,
    height: 120,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: Colors.gray200,
  },
  galleryThumbImage: { width: "100%", height: "100%" },
  section: { marginBottom: 16 },
  sectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  subheading: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.gray700,
    marginBottom: 4,
  },
  body: {
    ...Typography.body,
    color: Colors.gray800,
    lineHeight: 22,
  },
  metaLine: {
    ...Typography.body,
    color: Colors.gray700,
    lineHeight: 20,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  chip: {
    borderRadius: 999,
    backgroundColor: Colors.gray100,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  chipText: {
    ...Typography.caption,
    color: Colors.textPrimary,
  },
  link: {
    ...Typography.body,
    color: Colors.primaryViolet,
    textDecorationLine: "underline",
  },
});

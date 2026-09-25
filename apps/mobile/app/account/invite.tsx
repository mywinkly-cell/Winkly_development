// apps/mobile/app/account/invite.tsx
// Winkly – Account: Invite friends & connect contacts
// Connect contacts: expo-contacts + backend hashing when ready

import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Share, Alert, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import * as Contacts from "expo-contacts/legacy";
import { supabase } from "@/lib/supabase";
import { hashContactIdentifiers } from "@/lib/contacts/matching";

/** Public landing page; mywinkly.de/app/* would open the app but has no web fallback yet. */
const INVITE_URL = "https://mywinkly.de";

export default function Invite() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [contactsConnected, setContactsConnected] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [matchesCount, setMatchesCount] = useState<number | null>(null);

  const onShare = async () => {
    try {
      const message = t("account.invite.shareMessage", { link: INVITE_URL });

      await Share.share({ message });
    } catch (err: any) {
      if (__DEV__) console.warn("[invite] share failed:", err?.message);
      Alert.alert(t("account.invite.shareFailed"), t("common.tryAgain"));
    }
  };

  const onConnectContacts = async () => {
    try {
      setContactsLoading(true);

      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(t("account.invite.permissionTitle"), t("account.invite.permissionMessage"));
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
        pageSize: 5000,
        pageOffset: 0,
      });

      const emailHashes: string[] = [];
      const phoneHashes: string[] = [];
      for (const c of data ?? []) {
        const h = await hashContactIdentifiers(c);
        emailHashes.push(...h.emailHashes);
        phoneHashes.push(...h.phoneHashes);
      }

      const uniqEmails = Array.from(new Set(emailHashes)).slice(0, 5000);
      const uniqPhones = Array.from(new Set(phoneHashes)).slice(0, 5000);

      const { data: matches, error } = await supabase.rpc("match_contacts", {
        p_email_hashes: uniqEmails.length ? uniqEmails : null,
        p_phone_hashes: uniqPhones.length ? uniqPhones : null,
        p_limit: 200,
      });
      if (error) throw error;

      const uniqueMatchedUsers = new Set<string>();
      for (const row of (matches ?? []) as { user_id: string }[]) uniqueMatchedUsers.add(row.user_id);
      setMatchesCount(uniqueMatchedUsers.size);
      setContactsConnected(true);
    } catch (err: any) {
      if (__DEV__) console.warn("[invite] connect contacts failed:", err?.message);
      Alert.alert(t("account.invite.connectFailed"), t("common.tryAgain"));
    } finally {
      setContactsLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("account.invite.title")}</Text>
          <View style={{ width: 60 }} />
        </View>

        <Text style={styles.pageSubtitle}>
          {t("account.invite.subtitle")}
        </Text>

        {/* Connect contacts — primary CTA */}
        <View style={styles.card}>
          <View style={styles.iconBadge}>
            <Ionicons name="people" size={28} color={theme.colors.primary} />
          </View>
          <Text style={styles.cardTitle}>{t("account.invite.connectTitle")}</Text>
          <Text style={styles.cardSubtitle}>
            {t("account.invite.connectBody")}
          </Text>
          <TouchableOpacity
            onPress={onConnectContacts}
            style={[styles.primaryBtn, contactsConnected && styles.primaryBtnDisabled]}
            activeOpacity={0.9}
            disabled={contactsConnected || contactsLoading}
          >
            {contactsLoading ? (
              <ActivityIndicator color={theme.colors.onPrimary} style={{ marginRight: 10 }} />
            ) : (
              <Ionicons name="link" size={20} color={theme.colors.onPrimary} style={{ marginRight: 8 }} />
            )}
            <Text style={styles.primaryText}>
              {contactsConnected
                ? t("account.invite.connected")
                : contactsLoading
                  ? t("account.invite.connecting")
                  : t("account.invite.connect")}
            </Text>
          </TouchableOpacity>
          {matchesCount !== null ? (
            <Text style={styles.matchNote}>
              {matchesCount === 0
                ? t("account.invite.noMatches")
                : t("account.invite.matches", { count: matchesCount })}
            </Text>
          ) : null}
        </View>

        {/* Share invite */}
        <View style={styles.card}>
          <View style={styles.iconBadgeSecondary}>
            <Ionicons name="share-social" size={24} color={theme.colors.primary} />
          </View>
          <Text style={styles.cardTitle}>{t("account.invite.shareTitle")}</Text>
          <Text style={styles.cardSubtitle}>
            {t("account.invite.shareBody")}
          </Text>
          <TouchableOpacity onPress={onShare} style={styles.secondaryBtn} activeOpacity={0.9}>
            <Text style={styles.secondaryText}>{t("account.invite.shareButton")}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNote}>
          {t("account.invite.footer")}
        </Text>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: 20, paddingBottom: 40 },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      ...theme.elevation(1),
    },
    headerTitle: { ...theme.type.h2, color: theme.colors.textPrimary, flex: 1, textAlign: "center" },
    pageSubtitle: {
      ...theme.type.body,
      color: theme.colors.textSecondary,
      marginBottom: 24,
    },

    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 20,
      marginBottom: 16,
      ...theme.elevation(1),
    },
    iconBadge: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    iconBadgeSecondary: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    cardTitle: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: 6 },
    cardSubtitle: { ...theme.type.body, color: theme.colors.textSecondary, marginBottom: 16 },

    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 14,
      paddingHorizontal: theme.spacing.md,
    },
    primaryBtnDisabled: {
      opacity: 0.7,
    },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary, flexShrink: 1, textAlign: "center" },

    secondaryBtn: {
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    secondaryText: { ...theme.type.button, color: theme.colors.textPrimary, textAlign: "center" },

    footerNote: { ...theme.type.caption, color: theme.colors.textMuted, textAlign: "center", marginTop: 8 },
    matchNote: { ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 12 },
  });
}

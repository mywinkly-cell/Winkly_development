// apps/mobile/app/account/invite.tsx
// Winkly – Account: Invite friends & connect contacts
// Connect contacts: expo-contacts + backend hashing when ready

import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Share, Alert, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import * as Contacts from "expo-contacts";
import { supabase } from "@/lib/supabase";
import { hashContactIdentifiers } from "@/lib/contacts/matching";

export default function Invite() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [contactsConnected, setContactsConnected] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [matchesCount, setMatchesCount] = useState<number | null>(null);

  const onShare = async () => {
    try {
      const message =
        "Join me on Winkly 💜\n\nPlan dates, meetups, and events together — with AI that suggests the best options for everyone.\n\n(Invite link placeholder)";

      await Share.share({ message });
    } catch (err: any) {
      Alert.alert("Share failed", err?.message ?? "Please try again.");
    }
  };

  const onConnectContacts = async () => {
    try {
      setContactsLoading(true);

      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Contacts permission", "To connect contacts, allow access in your device settings.");
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
      Alert.alert("Connect contacts failed", err?.message ?? "Please try again.");
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
          <Text style={styles.headerTitle}>Invite</Text>
          <View style={{ width: 60 }} />
        </View>

        <Text style={styles.pageSubtitle}>
          Invite friends, connect contacts, and plan together
        </Text>

        {/* Connect contacts — primary CTA */}
        <View style={styles.card}>
          <View style={styles.iconBadge}>
            <Ionicons name="people" size={28} color={theme.colors.primary} />
          </View>
          <Text style={styles.cardTitle}>Connect your contacts</Text>
          <Text style={styles.cardSubtitle}>
            See who&apos;s already on Winkly and invite others. We only use hashed identifiers for matching — your contacts stay private.
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
              {contactsConnected ? "Contacts connected" : contactsLoading ? "Connecting…" : "Connect contacts"}
            </Text>
          </TouchableOpacity>
          {matchesCount !== null ? (
            <Text style={styles.matchNote}>
              {matchesCount === 0 ? "No matches yet — invite friends to join Winkly." : `${matchesCount} contact${matchesCount === 1 ? "" : "s"} already on Winkly.`}
            </Text>
          ) : null}
        </View>

        {/* Share invite */}
        <View style={styles.card}>
          <View style={styles.iconBadgeSecondary}>
            <Ionicons name="share-social" size={24} color={theme.colors.primary} />
          </View>
          <Text style={styles.cardTitle}>Share invite link</Text>
          <Text style={styles.cardSubtitle}>
            Send your friends a link to join Winkly. No contact access needed.
          </Text>
          <TouchableOpacity onPress={onShare} style={styles.secondaryBtn} activeOpacity={0.9}>
            <Text style={styles.secondaryText}>Share invite</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNote}>
          Contact matching requires your permission. We hash identifiers for privacy and never store raw contact data.
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
    headerTitle: { ...theme.type.h2, color: theme.colors.textPrimary },
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
    },
    primaryBtnDisabled: {
      opacity: 0.7,
    },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary },

    secondaryBtn: {
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    secondaryText: { ...theme.type.button, color: theme.colors.textPrimary },

    footerNote: { ...theme.type.caption, color: theme.colors.textMuted, textAlign: "center", marginTop: 8 },
    matchNote: { ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 12 },
  });
}

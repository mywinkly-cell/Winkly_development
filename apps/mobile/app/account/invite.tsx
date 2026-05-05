// apps/mobile/app/account/invite.tsx
// Winkly – Account: Invite friends & connect contacts
// Connect contacts: expo-contacts + backend hashing when ready

import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Share, Alert, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";
import * as Contacts from "expo-contacts";
import { supabase } from "@/lib/supabase";
import { hashContactIdentifiers } from "@/lib/contacts/matching";

export default function Invite() {
  const router = useRouter();
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
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
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
            <Ionicons name="people" size={28} color={Colors.primaryViolet} />
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
              <ActivityIndicator color={Colors.white} style={{ marginRight: 10 }} />
            ) : (
              <Ionicons name="link" size={20} color={Colors.white} style={{ marginRight: 8 }} />
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
            <Ionicons name="share-social" size={24} color={Colors.primaryViolet} />
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
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
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
  pageSubtitle: {
    ...Typography.body,
    color: Colors.gray600,
    marginBottom: 24,
  },

  card: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.backgroundMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  iconBadgeSecondary: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.backgroundMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  cardTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 6 },
  cardSubtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 16 },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  secondaryBtn: {
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },

  footerNote: { ...Typography.caption, color: Colors.gray500, textAlign: "center", marginTop: 8 },
  matchNote: { ...Typography.caption, color: Colors.gray600, marginTop: 12 },
});

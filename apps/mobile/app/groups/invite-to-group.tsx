/**
 * Invite people to an EXISTING group.
 *  - Lists current-mode connections as a checklist (pre-filtered to exclude members).
 *  - "From contacts" surfaces Winkly users matched from the phone contact list.
 *  - "Share invite link" generates a group-scoped code for non-Winkly contacts.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Share,
  Image,
} from "react-native";
import * as Contacts from "expo-contacts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { hashContactIdentifiers } from "@/lib/contacts/matching";
import { getPartnersForConcierge, type ConciergePartner } from "@/lib/ai/conciergePartners";
import { inviteUsersToGroup } from "@/lib/groupInvitations";
import { getGroupMembers, ensureGroupInviteCode, getGroupDetails } from "@/lib/groups/groupsApi";
import type { Mode } from "@/types";

type Candidate = { id: string; displayName: string; avatar_url?: string | null; source: "connection" | "contact" };

export default function InviteToGroup() {
  const router = useRouter();
  const { groupId, mode } = useLocalSearchParams<{ groupId?: string; mode?: Mode }>();
  const gid = String(groupId ?? "");
  const groupMode = (mode as Mode) ?? "friends";

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [groupName, setGroupName] = useState("group");

  const load = useCallback(async () => {
    try {
      const [partners, members, details] = await Promise.all([
        getPartnersForConcierge(groupMode),
        getGroupMembers(gid),
        getGroupDetails(gid),
      ]);
      if (details?.name) setGroupName(details.name);
      const mIds = new Set(members.map((m) => m.user_id));
      setMemberIds(mIds);
      setCandidates(
        partners
          .filter((p: ConciergePartner) => !mIds.has(p.id))
          .map((p: ConciergePartner) => ({
            id: p.id,
            displayName: p.displayName,
            avatar_url: p.avatar_url,
            source: "connection" as const,
          }))
      );
    } catch {
      // keep prior
    } finally {
      setLoading(false);
    }
  }, [gid, groupMode]);

  useEffect(() => {
    load();
  }, [load]);

  const onConnectContacts = async () => {
    setContactsLoading(true);
    try {
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert("Contacts permission", "Allow contact access in settings to find friends already on Winkly.");
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
        pageSize: 5000,
      });
      const emailHashes: string[] = [];
      const phoneHashes: string[] = [];
      for (const c of data ?? []) {
        const h = await hashContactIdentifiers(c);
        emailHashes.push(...h.emailHashes);
        phoneHashes.push(...h.phoneHashes);
      }
      const { data: matches, error } = await supabase.rpc("match_contacts", {
        p_email_hashes: emailHashes.length ? [...new Set(emailHashes)].slice(0, 5000) : null,
        p_phone_hashes: phoneHashes.length ? [...new Set(phoneHashes)].slice(0, 5000) : null,
        p_limit: 200,
      });
      if (error) throw error;
      const matchedIds = [...new Set((matches ?? []).map((r: { user_id: string }) => r.user_id))].filter(
        (id) => !memberIds.has(id)
      );
      if (matchedIds.length === 0) {
        Alert.alert("No new matches", "None of your contacts (outside this group) are on Winkly yet.");
        return;
      }
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, first_name, last_name, main_photo_url")
        .in("id", matchedIds);
      setCandidates((prev) => {
        const existing = new Set(prev.map((c) => c.id));
        const next = [...prev];
        (profiles ?? []).forEach((p: Record<string, unknown>) => {
          const id = p.id as string;
          if (existing.has(id)) return;
          const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Contact";
          next.push({ id, displayName: name, avatar_url: (p.main_photo_url as string) ?? null, source: "contact" });
        });
        return next;
      });
    } catch (e) {
      Alert.alert("Couldn't load contacts", (e as Error)?.message ?? "Please try again.");
    } finally {
      setContactsLoading(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onShareLink = async () => {
    try {
      const code = await ensureGroupInviteCode(gid);
      await Share.share({ message: `Join "${groupName}" on Winkly: winkly://groups/join?code=${code}` });
    } catch (e) {
      Alert.alert("Error", (e as Error)?.message ?? "Could not create an invite link.");
    }
  };

  const onInvite = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const { invited, skipped } = await inviteUsersToGroup(gid, [...selected]);
      Alert.alert(
        "Invitations sent",
        `${invited} ${invited === 1 ? "person" : "people"} invited.${skipped > 0 ? ` ${skipped} already invited or members.` : ""}`,
        [{ text: "Done", onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert("Error", (e as Error)?.message ?? "Could not send invitations.");
    } finally {
      setSubmitting(false);
    }
  };

  const sorted = useMemo(() => candidates, [candidates]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Invite people</Text>
          <View style={{ width: 44 }} />
        </View>

        <TouchableOpacity onPress={onConnectContacts} style={styles.contactsBtn} activeOpacity={0.9} disabled={contactsLoading}>
          {contactsLoading ? (
            <ActivityIndicator size="small" color={Colors.primaryViolet} />
          ) : (
            <>
              <Ionicons name="people-outline" size={18} color={Colors.primaryViolet} />
              <Text style={styles.contactsText}>Find friends from contacts</Text>
            </>
          )}
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator size="small" color={Colors.primaryViolet} style={{ marginTop: 24 }} />
        ) : sorted.length === 0 ? (
          <Text style={styles.empty}>No connections to invite yet. Share an invite link instead.</Text>
        ) : (
          sorted.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => toggle(c.id)}
              style={[styles.row, selected.has(c.id) && styles.rowSelected]}
            >
              {c.avatar_url ? (
                <Image source={{ uri: c.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{c.displayName.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name} numberOfLines={1}>{c.displayName}</Text>
                {c.source === "contact" ? <Text style={styles.tag}>From contacts</Text> : null}
              </View>
              <View style={[styles.checkbox, selected.has(c.id) && styles.checkboxChecked]}>
                {selected.has(c.id) ? <Ionicons name="checkmark" size={16} color="#FFF" /> : null}
              </View>
            </Pressable>
          ))
        )}

        <TouchableOpacity
          onPress={onInvite}
          style={[styles.primaryBtn, (selected.size === 0 || submitting) && styles.btnDisabled]}
          disabled={selected.size === 0 || submitting}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.primaryText}>{selected.size > 0 ? `Invite ${selected.size}` : "Select people to invite"}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onShareLink} style={styles.secondaryBtn} activeOpacity={0.9}>
          <Ionicons name="link-outline" size={18} color={Colors.textPrimary} />
          <Text style={styles.secondaryText}>Share invite link</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  scroll: { padding: 20, paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },

  contactsBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: Layout.radii.control,
    borderWidth: 1,
    borderColor: Colors.primaryViolet + "55",
    backgroundColor: Colors.primaryViolet + "10",
    marginBottom: 16,
  },
  contactsText: { ...Typography.button, color: Colors.primaryViolet },

  empty: { ...Typography.body, color: Colors.gray600, textAlign: "center", marginVertical: 20 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFF",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  rowSelected: { borderColor: Colors.primaryViolet, backgroundColor: Colors.primaryViolet + "10" },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryViolet + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { ...Typography.body, fontWeight: "700", color: Colors.primaryViolet },
  name: { ...Typography.body, color: Colors.textPrimary },
  tag: { ...Typography.caption, color: Colors.gray500, marginTop: 2 },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.gray400,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: Colors.primaryViolet, borderColor: Colors.primaryViolet },

  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  btnDisabled: { opacity: 0.5 },
  primaryText: { ...Typography.button, color: "#FFF" },

  secondaryBtn: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginTop: 10,
  },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },
});

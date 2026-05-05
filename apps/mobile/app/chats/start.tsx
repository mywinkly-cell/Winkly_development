// Start chat / group chat — Entry from Chats header "+" button.
// Options: New chat, New group chat; search by name or number; list of Winkly contacts; Invite to Winkly.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Image,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Colors, Typography, Layout, HEADER } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { createDirectChat } from "@/lib/chats";
import type { AppMode, DMSource } from "@/lib/chats";

type UserMini = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  main_photo_url?: string | null;
  romance_photos?: string[];
  core_photos?: string[];
};

function formatName(u: UserMini) {
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  return `${fn} ${ln}`.trim() || "Unknown";
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** Normalize search string for number matching: digits only (all formats). */
function normalizePhoneQuery(q: string): string {
  return q.replace(/\D/g, "");
}

async function loadWinklyContacts(userId: string, search: string): Promise<UserMini[]> {
  const trimmed = search.trim();
  const isNumberSearch = trimmed.length > 0 && /[\d]/.test(trimmed) && /^[\d\s\-+()]+$/.test(trimmed);
  const numOnly = normalizePhoneQuery(trimmed);

  let query = supabase
    .from("user_profiles")
    .select("id,first_name,last_name,city,main_photo_url,core_photos");

  if (trimmed.length >= 1) {
    if (isNumberSearch && numOnly.length >= 3) {
      // If backend had phone column we could: .or(`phone.ilike.%${numOnly}%`)
      // For now search name/city as well so "555" might match; when phone is added, add phone to search
      query = query.or(
        `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,city.ilike.%${trimmed}%`
      );
    } else {
      query = query.or(
        `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,city.ilike.%${trimmed}%`
      );
    }
  } else {
    query = query.order("first_name", { ascending: true }).limit(80);
  }

  const { data, error } = await query.limit(200);
  if (error) throw error;

  const list = (data ?? []) as UserMini[];
  return list;
}

export default function StartChat() {
  const { i18n } = useTranslation();
  const router = useRouter();
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 280);
  const [users, setUsers] = useState<UserMini[]>([]);
  const mode: AppMode = "friends";

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setMeId(auth.user?.id ?? null);
    })();
  }, []);

  const loadUsers = useCallback(async (search: string) => {
    setError(null);
    setLoading(true);
    try {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) {
        setUsers([]);
        return;
      }
      const list = await loadWinklyContacts(uid, search);
      setUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contacts.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!meId) return;
    loadUsers(debouncedQ);
  }, [meId, debouncedQ, loadUsers]);

  const filtered = useMemo(
    () => users.filter((u) => u.id !== meId),
    [users, meId]
  );

  const handleNewChat = (otherUserId: string) => {
    if (!meId || creating) return;
    setCreating(true);
    setError(null);
    createDirectChat(otherUserId, mode, "invite", meId)
      .then((conversationId) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.replace(`/chats/${conversationId}`);
      })
      .catch((e) => setError(e?.message ?? "Failed to start chat."))
      .finally(() => setCreating(false));
  };

  const handleNewGroupChat = () => {
    Haptics.selectionAsync();
    router.replace("/groups/create-group");
  };

  const handleInviteToWinkly = () => {
    Haptics.selectionAsync();
    router.push("/account/invite");
  };

  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          style={styles.backBtn}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>New conversation</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
        <View style={styles.optionsRow}>
          <Pressable
            onPress={() => router.push("/chats/new-chat?mode=friends")}
            style={styles.optionCard}
          >
            <View style={styles.optionIconWrap}>
              <Ionicons name="chatbubble-outline" size={26} color={Colors.primaryViolet} />
            </View>
            <Text style={styles.optionTitle}>New chat</Text>
            <Text style={styles.optionSub}>Start a 1:1 chat</Text>
          </Pressable>
          <Pressable onPress={handleNewGroupChat} style={styles.optionCard}>
            <View style={styles.optionIconWrap}>
              <Ionicons name="people-outline" size={26} color={Colors.primaryViolet} />
            </View>
            <Text style={styles.optionTitle}>Group chat</Text>
            <Text style={styles.optionSub}>Create a group</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.push("/groups/invitations"); }}
          style={styles.invitationsLink}
        >
          <Ionicons name="mail-outline" size={20} color={Colors.primaryViolet} />
          <Text style={styles.invitationsLinkText}>Group invitations</Text>
        </Pressable>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by name or number…"
          placeholderTextColor={Colors.gray500}
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.searchInput}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {creating ? <Text style={styles.creatingText}>Starting chat…</Text> : null}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Contacts on Winkly</Text>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(u) => u.id}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleNewChat(item.id)}
                disabled={creating}
                style={({ pressed }) => [
                  styles.contactRow,
                  pressed && styles.contactRowPressed,
                  creating && styles.contactRowDisabled,
                ]}
              >
                <View style={styles.avatar}>
                  {(item.main_photo_url ?? item.romance_photos?.[0] ?? item.core_photos?.[0]) ? (
                    <Image
                      source={{
                        uri:
                          item.main_photo_url ??
                          item.romance_photos?.[0] ??
                          item.core_photos?.[0] ??
                          "",
                      }}
                      style={styles.avatarImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Ionicons name="person" size={24} color={Colors.gray500} />
                    </View>
                  )}
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{formatName(item)}</Text>
                  <Text style={styles.contactMeta}>
                    {item.city?.trim()
                      ? normalizeLocationDisplayString(item.city, i18n?.language ?? "en")
                      : "—"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {q.trim()
                  ? "No contacts found. Try another search or invite them to Winkly."
                  : "No contacts yet. Use search or invite people to Winkly."}
              </Text>
            }
          />
        )}

        <Pressable onPress={handleInviteToWinkly} style={styles.inviteRow}>
          <View style={styles.inviteIconWrap}>
            <Ionicons name="person-add-outline" size={24} color={Colors.primaryViolet} />
          </View>
          <View style={styles.inviteTextWrap}>
            <Text style={styles.inviteTitle}>Invite to Winkly</Text>
            <Text style={styles.inviteSub}>Add a contact who isn’t on Winkly yet</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.gray500} />
        </Pressable>
      </View>
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    ...Layout.topHeaderBar,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  backBtn: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonRadius,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Typography.headerTitle,
    color: Colors.primaryViolet,
  },
  headerRight: { width: HEADER.buttonSize, height: HEADER.buttonSize },
  content: { flex: 1, padding: 16 },
  optionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  optionCard: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
    alignItems: "center",
  },
  optionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryViolet + "18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  optionTitle: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary },
  optionSub: { fontSize: 12, color: Colors.gray600, marginTop: 2 },
  invitationsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  invitationsLinkText: { ...Typography.caption, fontWeight: "600", color: Colors.primaryViolet },
  searchInput: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  errorText: { color: Colors.errorRed, marginBottom: 8 },
  creatingText: { opacity: 0.7, marginBottom: 8 },
  sectionRow: { marginBottom: 10 },
  sectionTitle: { ...Typography.caption, fontWeight: "600", color: Colors.gray600 },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 8, opacity: 0.7 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  contactRowPressed: { opacity: 0.85 },
  contactRowDisabled: { opacity: 0.6 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gray100,
    overflow: "hidden",
    marginRight: 12,
  },
  avatarImg: { width: 48, height: 48 },
  avatarPlaceholder: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  contactInfo: { flex: 1 },
  contactName: { ...Typography.body, fontWeight: "600" },
  contactMeta: { fontSize: 13, color: Colors.gray600, marginTop: 2 },
  emptyText: { opacity: 0.7, textAlign: "center", marginTop: 24, paddingHorizontal: 20 },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.primaryViolet + "0C",
    borderWidth: 1,
    borderColor: Colors.primaryViolet + "30",
    marginTop: 12,
  },
  inviteIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryViolet + "20",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  inviteTextWrap: { flex: 1 },
  inviteTitle: { ...Typography.body, fontWeight: "600", color: Colors.primaryViolet },
  inviteSub: { fontSize: 12, color: Colors.gray600, marginTop: 2 },
});

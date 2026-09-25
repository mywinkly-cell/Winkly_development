// Start chat / group chat — Entry from Chats header "+" button.
// Options: New chat, New group chat; search by name or number; list of Winkly contacts; Invite to Winkly.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Image,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { chatRoutes, useModeHub } from "@/lib/navigation/modeHub";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Card, Header, Input, ListRow } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
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
  return `${fn} ${ln}`.trim() || i18next.t("chat.unknown");
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
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const chatHub = useModeHub();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  useEffect(() => {
    if (chatHub === "romance") {
      router.replace(chatRoutes.newChat(chatHub, "romance") as Parameters<typeof router.replace>[0]);
    }
  }, [chatHub, router]);
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
      setError(e instanceof Error ? e.message : t("chat.start.loadFailed"));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!meId) return;
    loadUsers(debouncedQ);
  }, [meId, debouncedQ, loadUsers]);

  const filtered = useMemo(
    () => users.filter((u) => u.id !== meId),
    [users, meId]
  );

  const handleNewChat = (user: UserMini) => {
    if (!meId || creating) return;
    setCreating(true);
    setError(null);
    const photo =
      user.main_photo_url ?? user.romance_photos?.[0] ?? user.core_photos?.[0] ?? "";
    createDirectChat(user.id, mode, "invite", meId)
      .then((conversationId) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.replace(
          chatRoutes.conversation(chatHub, conversationId, {
            partnerUserId: user.id,
            partnerName: formatName(user),
            partnerPhotoUrl: photo,
          }) as Parameters<typeof router.replace>[0]
        );
      })
      .catch((e) => setError(e?.message ?? t("chat.start.startFailed")))
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
      <Header
        title={t("chat.header.newConversation")}
        onBack={() => {
          Haptics.selectionAsync();
          router.back();
        }}
      />

      <View style={styles.content}>
        <View style={styles.optionsRow}>
          <Card padding="md" style={styles.optionCard}>
            <Pressable onPress={() => router.push(chatRoutes.newChat(chatHub, "friends"))} style={styles.optionPressable}>
              <View style={styles.optionIconWrap}>
                <Ionicons name="chatbubble-outline" size={26} color={theme.colors.primary} />
              </View>
              <Text style={styles.optionTitle}>{t("chat.newChat")}</Text>
              <Text style={styles.optionSub}>{t("chat.start.newChatSub")}</Text>
            </Pressable>
          </Card>
          <Card padding="md" style={styles.optionCard}>
            <Pressable onPress={handleNewGroupChat} style={styles.optionPressable}>
              <View style={styles.optionIconWrap}>
                <Ionicons name="people-outline" size={26} color={theme.colors.primary} />
              </View>
              <Text style={styles.optionTitle}>{t("chat.groupChatTitle")}</Text>
              <Text style={styles.optionSub}>{t("chat.start.groupChatSub")}</Text>
            </Pressable>
          </Card>
        </View>
        <ListRow
          title={t("chat.start.groupInvitations")}
          onPress={() => { Haptics.selectionAsync(); router.push("/groups/invitations"); }}
          style={styles.linkRow}
          leading={<Ionicons name="mail-outline" size={20} color={theme.colors.primary} />}
          showChevron={false}
        />
        <ListRow
          title={t("chat.start.friendRequests")}
          onPress={() => {
            Haptics.selectionAsync();
            router.push("/(modes)/friends/friend-requests");
          }}
          style={styles.linkRow}
          leading={<Ionicons name="people-outline" size={20} color={theme.colors.primary} />}
          showChevron={false}
        />

        <Input
          value={q}
          onChangeText={setQ}
          placeholder={t("chat.start.searchPlaceholder")}
          autoCorrect={false}
          autoCapitalize="none"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {creating ? <Text style={styles.creatingText}>{t("chat.start.starting")}</Text> : null}

        <Text style={styles.sectionTitle}>{t("chat.start.contactsOnWinkly")}</Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>{t("common.loading")}</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(u) => u.id}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
            renderItem={({ item }) => (
              <ListRow
                title={formatName(item)}
                subtitle={
                  item.city?.trim()
                    ? normalizeLocationDisplayString(item.city, i18n?.language ?? "en")
                    : "—"
                }
                onPress={() => handleNewChat(item)}
                disabled={creating}
                style={styles.contactRow}
                leading={<ContactAvatar item={item} theme={theme} />}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {q.trim()
                  ? t("chat.start.noContactsFound")
                  : t("chat.start.noContacts")}
              </Text>
            }
          />
        )}

        <ListRow
          title={t("chat.start.inviteToWinkly")}
          subtitle={t("chat.start.inviteToWinklySub")}
          onPress={handleInviteToWinkly}
          style={styles.inviteRow}
          leading={<Ionicons name="person-add-outline" size={24} color={theme.colors.primary} />}
        />
      </View>
    </SafeScreenView>
  );
}

function ContactAvatar({ item, theme }: { item: UserMini; theme: AppTheme }) {
  const uri = item.main_photo_url ?? item.romance_photos?.[0] ?? item.core_photos?.[0];
  return (
    <View style={{ width: 48, height: 48, borderRadius: theme.radii.pill, backgroundColor: theme.colors.backgroundMuted, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: 48, height: 48 }} resizeMode="cover" />
      ) : (
        <Ionicons name="person" size={24} color={theme.colors.textMuted} />
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { flex: 1, padding: theme.spacing.lg },
    optionsRow: {
      flexDirection: "row",
      gap: theme.spacing.md,
      marginBottom: theme.spacing.lg,
    },
    optionCard: { flex: 1, alignItems: "center" },
    optionPressable: { alignItems: "center" },
    optionIconWrap: {
      width: 48,
      height: 48,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.primary + "18",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.sm,
    },
    optionTitle: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, color: theme.colors.textPrimary, textAlign: "center" },
    optionSub: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.xxs, textAlign: "center" },
    linkRow: { paddingHorizontal: theme.spacing.xxs, marginBottom: theme.spacing.xs },
    errorText: { color: theme.colors.error, marginBottom: theme.spacing.sm },
    creatingText: { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
    sectionTitle: {
      ...theme.type.overline,
      fontFamily: theme.type.overline.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
    loadingText: { marginTop: theme.spacing.sm, color: theme.colors.textSecondary },
    contactRow: {
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptyText: { textAlign: "center", marginTop: theme.spacing.xxl, paddingHorizontal: theme.spacing.xl, color: theme.colors.textSecondary },
    inviteRow: {
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.primary + "0C",
      borderWidth: 1,
      borderColor: theme.colors.primary + "30",
      marginTop: theme.spacing.md,
    },
  });
}

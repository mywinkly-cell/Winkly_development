import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Header, Input, ListRow } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { chatRoutes, useModeHub } from "@/lib/navigation/modeHub";
import { supabase } from "@/lib/supabase";
import { createDirectChat } from "@/lib/chats";
import type { AppMode, DMSource } from "@/lib/chats";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";

type UserMini = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  main_photo_url?: string | null;
  romance_photos?: string[];
  core_photos?: string[];
};

function isAppMode(x: unknown): x is AppMode {
  return x === "romance" || x === "friends" || x === "business" || x === "events";
}

function formatName(u: UserMini) {
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || i18n.t("chat.unknown");
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** Romance: only matches can start 1:1 direct chats per spec */
async function loadRomanceMatches(userId: string): Promise<UserMini[]> {
  const [newRes, connRes] = await Promise.all([
    supabase.rpc("romance_new_matches", { current_user_id: userId }),
    supabase.rpc("romance_connections", { current_user_id: userId }),
  ]);
  const newMatches = (newRes.data ?? []) as Record<string, unknown>[];
  const connections = (connRes.data ?? []) as Record<string, unknown>[];
  const seen = new Set<string>();
  const list: UserMini[] = [];
  for (const m of [...newMatches, ...connections]) {
    const id = m.id as string;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const photos = (m.romance_photos ?? m.core_photos ?? []) as string[];
    list.push({
      id,
      first_name: (m.first_name as string) ?? null,
      last_name: (m.last_name as string) ?? null,
      city: (m.city as string) ?? null,
      main_photo_url: photos[0] ?? null,
      romance_photos: photos,
      core_photos: (m.core_photos as string[]) ?? [],
    });
  }
  return list;
}

export default function NewChat() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const chatHub = useModeHub();
  const fmtLoc = useFormatLocationDisplay();
  const params = useLocalSearchParams<{ mode?: string }>();

  const mode: AppMode = useMemo(() => {
    const m = params.mode;
    if (isAppMode(m)) return m;
    return "friends";
  }, [params.mode]);

  const isRomance = mode === "romance";

  const [meId, setMeId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 250);

  const [users, setUsers] = useState<UserMini[]>([]);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      setMeId(auth.user?.id ?? null);
    })();
  }, []);

  // Load users (server-side search when query exists)
  async function loadUsers(search: string) {
    setError(null);
    setLoading(true);

    try {
      // NOTE:
      // We query user_profiles because that's what you currently have.
      // RLS must allow reading whichever subset you intend (public info only).
      let query = supabase.from("user_profiles").select("id,first_name,last_name,city");

      const s = search.trim();
      if (s.length >= 1) {
        // server-side name/city search
        // (Supabase supports ilike)
        // We do a simple OR across first_name / last_name / city
        query = query.or(
          `first_name.ilike.%${s}%,last_name.ilike.%${s}%,city.ilike.%${s}%`
        );
      } else {
        // default “directory” slice (small)
        query = query.order("first_name", { ascending: true }).limit(50);
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;

      const list = (data ?? []) as UserMini[];
      setUsers(list);
    } catch (e: any) {
      setError(e?.message ?? t("chat.newChatScreen.loadUsersFailed"));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!meId) return;
    if (isRomance) {
      setLoading(true);
      setError(null);
      loadRomanceMatches(meId)
        .then(setUsers)
        .catch((e) => {
          setError(e instanceof Error ? e.message : t("chat.newChatScreen.loadMatchesFailed"));
          setUsers([]);
        })
        .finally(() => setLoading(false));
    } else {
      loadUsers(debouncedQ);
    }
  }, [meId, isRomance, debouncedQ, t]);

  const filtered = useMemo(() => {
    // We still filter out self locally
    return users.filter((u) => u.id !== meId);
  }, [users, meId]);

  async function handleCreateDirectChat(user: UserMini) {
    if (!meId) {
      setError(t("chat.newChatScreen.notSignedIn"));
      return;
    }
    if (creating) return;

    setCreating(true);
    setError(null);

    try {
      // create_direct_chat RPC returns existing chat id if one exists (idempotent)
      const source: DMSource = isRomance ? "match" : "invite";
      const conversationId = await createDirectChat(user.id, mode, source, meId);
      const photo =
        user.main_photo_url ?? user.romance_photos?.[0] ?? user.core_photos?.[0] ?? "";
      router.replace(
        chatRoutes.conversation(chatHub, conversationId, {
          partnerUserId: user.id,
          partnerName: formatName(user),
          partnerPhotoUrl: photo,
        }) as Parameters<typeof router.replace>[0]
      );
    } catch (e: any) {
      setError(e?.message ?? t("chat.newChatScreen.createFailed"));
    } finally {
      setCreating(false);
    }
  }

  const styles = createStyles(theme);

  return (
    <SafeScreenView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        title={isRomance ? t("chat.newChatScreen.romanceTitle") : t("chat.newChat")}
        onBack={() => router.back()}
      />
      <Text style={styles.subtitle}>
        {isRomance
          ? t("chat.newChatScreen.romanceSubtitle")
          : t("chat.newChatScreen.subtitle", { mode: t(`modes.${mode}`) })}
      </Text>

      <View style={styles.content}>
        {error ? <Text style={styles.errorText}>{t("chat.errorWithMessage", { message: error })}</Text> : null}

        {!isRomance && (
          <ListRow
            title={t("chat.newChatScreen.createGroup")}
            subtitle={t("chat.newChatScreen.createGroupSubtitle")}
            onPress={() => router.replace("/groups/create-group")}
            style={styles.groupRow}
            leading={<Ionicons name="people" size={24} color={theme.colors.primary} />}
          />
        )}

        {!isRomance && (
          <Input
            value={q}
            onChangeText={setQ}
            placeholder={t("chat.newChatScreen.searchPlaceholder")}
            autoCorrect={false}
            autoCapitalize="none"
          />
        )}

        {creating ? <Text style={styles.creatingText}>{t("chat.newChatScreen.creating")}</Text> : null}

        {loading ? (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>{t("common.loading")}</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(u) => u.id}
            ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
            renderItem={({ item }) => (
              <ListRow
                title={formatName(item)}
                subtitle={fmtLoc(item.city) || "—"}
                onPress={() => handleCreateDirectChat(item)}
                disabled={creating}
                style={styles.contactRow}
                leading={<ContactAvatar item={item} theme={theme} />}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {isRomance
                  ? t("chat.newChatScreen.emptyRomance")
                  : q.trim()
                  ? t("chat.newChatScreen.noUsers")
                  : t("chat.newChatScreen.emptyHint")}
              </Text>
            }
          />
        )}
      </View>
    </SafeScreenView>
  );
}

function ContactAvatar({ item, theme }: { item: UserMini; theme: AppTheme }) {
  const uri = item.main_photo_url || item.romance_photos?.[0] || item.core_photos?.[0];
  return (
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.backgroundMuted,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: 48, height: 48 }} resizeMode="cover" />
      ) : (
        <Ionicons name="person" size={24} color={theme.colors.textMuted} />
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return {
    subtitle: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.xs,
    },
    content: { flex: 1, padding: theme.spacing.md },
    errorText: { color: theme.colors.error, marginBottom: theme.spacing.sm },
    creatingText: { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
    loadingText: { textAlign: "center" as const, marginTop: theme.spacing.sm, color: theme.colors.textSecondary },
    groupRow: {
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.backgroundMuted,
      marginBottom: theme.spacing.md,
    },
    contactRow: {
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    emptyText: { textAlign: "center" as const, marginTop: theme.spacing.xxl, color: theme.colors.textSecondary },
  };
}

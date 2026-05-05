import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Colors, Typography } from "@/constants/tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
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

function isAppMode(x: unknown): x is AppMode {
  return x === "romance" || x === "friends" || x === "business" || x === "events";
}

function formatName(u: UserMini) {
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || "Unknown";
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
  const newMatches = (newRes.data ?? []) as Array<Record<string, unknown>>;
  const connections = (connRes.data ?? []) as Array<Record<string, unknown>>;
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
  const router = useRouter();
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
      setError(e?.message ?? "Failed to load users.");
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
          setError(e instanceof Error ? e.message : "Failed to load matches.");
          setUsers([]);
        })
        .finally(() => setLoading(false));
    } else {
      loadUsers(debouncedQ);
    }
  }, [meId, isRomance, debouncedQ]);

  const filtered = useMemo(() => {
    // We still filter out self locally
    return users.filter((u) => u.id !== meId);
  }, [users, meId]);

  async function handleCreateDirectChat(otherUserId: string) {
    if (!meId) {
      setError("You are not signed in.");
      return;
    }
    if (creating) return;

    setCreating(true);
    setError(null);

    try {
      // create_direct_chat RPC returns existing chat id if one exists (idempotent)
      const source: DMSource = isRomance ? "match" : "invite";
      const conversationId = await createDirectChat(otherUserId, mode, source, meId);
      router.replace(`/chats/${conversationId}`);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create chat.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeScreenView style={{ flex: 1 }}>
      {/* Top bar */}
      <View
        style={{
          padding: 14,
          borderBottomWidth: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
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
          }}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "900", fontSize: 16 }}>New chat</Text>
          <Text style={{ opacity: 0.65, marginTop: 2, fontSize: 12 }}>
            {isRomance
              ? "1:1 chats with your matches only"
              : `Start a 1:1 chat or create a group — ${mode}`}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, padding: 14 }}>
        {error ? <Text style={{ color: "crimson", marginBottom: 10 }}>Error: {error}</Text> : null}

        {!isRomance && (
          <Pressable
            onPress={() => router.replace("/groups/create-group")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 14,
              backgroundColor: Colors.gray100,
              marginBottom: 14,
              borderWidth: 1,
              borderColor: Colors.gray200,
            }}
          >
            <Ionicons name="people" size={24} color={Colors.primaryViolet} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "600", fontSize: 15 }}>Create group chat</Text>
              <Text style={{ fontSize: 12, color: Colors.gray600, marginTop: 2 }}>
                Invite matches & contacts — planning made easy
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray500} />
          </Pressable>
        )}

        {!isRomance && (
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search by name or city…"
            autoCorrect={false}
            autoCapitalize="none"
            style={{
              borderWidth: 1,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 12,
            }}
          />
        )}

        {creating ? <Text style={{ opacity: 0.7, marginBottom: 8 }}>Creating chat…</Text> : null}

        {loading ? (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <ActivityIndicator />
            <Text style={{ textAlign: "center", marginTop: 8, opacity: 0.7 }}>Loading…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(u) => u.id}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleCreateDirectChat(item.id)}
                disabled={creating}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: Colors.gray200,
                  opacity: creating ? 0.6 : 1,
                  backgroundColor: Colors.white,
                  shadowColor: "#1C1C1E",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.06,
                  shadowRadius: 4,
                  elevation: 2,
                }}
              >
                <View
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: Colors.gray100,
                    overflow: "hidden",
                    marginRight: 12,
                  }}
                >
                  {(item.main_photo_url || (item as UserMini).romance_photos?.[0] || (item as UserMini).core_photos?.[0]) ? (
                    <Image
                      source={{
                        uri:
                          item.main_photo_url ??
                          (item as UserMini).romance_photos?.[0] ??
                          (item as UserMini).core_photos?.[0] ??
                          "",
                      }}
                      style={{ width: 48, height: 48 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="person" size={24} color={Colors.gray500} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...Typography.body, fontWeight: "600" }}>{formatName(item)}</Text>
                  <Text style={{ fontSize: 13, color: Colors.gray600, marginTop: 2 }}>
                    {item.city ?? "—"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={{ opacity: 0.7, textAlign: "center", marginTop: 24 }}>
                {isRomance
                  ? "No matches yet. Discover people and let the spark happen."
                  : q.trim()
                  ? "No users found."
                  : "Start typing to search, or pick someone from the list."}
              </Text>
            }
          />
        )}
      </View>
    </SafeScreenView>
  );
}

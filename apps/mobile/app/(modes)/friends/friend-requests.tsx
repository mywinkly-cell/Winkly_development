import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { chatRoutes } from "@/lib/navigation/modeHub";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  acceptFriendsRequest,
  declineFriendsRequest,
  listIncomingFriendsRequests,
  type IncomingFriendsRequestRow,
} from "@/lib/matching/actions";
import { Colors, Typography, Layout, HEADER } from "@/constants/tokens";

export default function FriendRequestsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [items, setItems] = useState<IncomingFriendsRequestRow[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listIncomingFriendsRequests();
      setItems(list);
    } catch (e) {
      console.warn("Friend requests load failed", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onAccept = async (requesterId: string) => {
    setBusyId(requesterId);
    try {
      const res = await acceptFriendsRequest(requesterId);
      if (!res.ok) {
        Alert.alert("Could not accept", res.error ?? "Try again.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
      if (res.chat_id) {
        router.replace(
          chatRoutes.conversation("friends", res.chat_id) as Parameters<typeof router.replace>[0]
        );
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Accept failed.");
    } finally {
      setBusyId(null);
    }
  };

  const onDecline = async (requesterId: string) => {
    setBusyId(requesterId);
    try {
      const res = await declineFriendsRequest(requesterId);
      if (!res.ok) {
        Alert.alert("Could not decline", res.error ?? "Try again.");
        return;
      }
      Haptics.selectionAsync();
      await refresh();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Decline failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
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
        <Text style={styles.headerTitle}>Connection requests</Text>
        <View style={styles.headerRight} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.friends.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.requester_id}
          contentContainerStyle={items.length === 0 ? styles.emptyWrap : styles.listPad}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => {
            const busy = busyId === item.requester_id;
            const kindLabel = item.kind === "super_connect" ? "Super Connect" : "Connect";
            return (
              <View style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    {item.photo_url ? (
                      <Image source={{ uri: item.photo_url }} style={styles.avatarImg} resizeMode="cover" />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Ionicons name="person" size={24} color={Colors.gray500} />
                      </View>
                    )}
                  </View>
                  <View style={styles.meta}>
                    <Text style={styles.name}>{item.display_name}</Text>
                    <Text style={styles.kind}>{kindLabel}</Text>
                    {item.message ? <Text style={styles.msg} numberOfLines={3}>{item.message}</Text> : null}
                  </View>
                </View>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => onDecline(item.requester_id)}
                    disabled={busy}
                    style={({ pressed }) => [styles.btnSecondary, pressed && styles.btnPressed, busy && styles.btnDisabled]}
                  >
                    <Text style={styles.btnSecondaryText}>Decline</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onAccept(item.requester_id)}
                    disabled={busy}
                    style={({ pressed }) => [styles.btnPrimary, pressed && styles.btnPressed, busy && styles.btnDisabled]}
                  >
                    {busy ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={styles.btnPrimaryText}>Accept</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No pending requests. When someone sends a Super Connect, it will show up here.</Text>
          }
        />
      )}
    </View>
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
    color: Colors.friends.primary,
  },
  headerRight: { width: HEADER.buttonSize },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listPad: { padding: 16, paddingBottom: 32 },
  emptyWrap: { flexGrow: 1, padding: 24, justifyContent: "center" },
  emptyText: { ...Typography.body, color: Colors.gray600, textAlign: "center" },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 14,
  },
  row: { flexDirection: "row", alignItems: "flex-start" },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: Colors.gray100,
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  meta: { flex: 1, marginLeft: 12 },
  name: { ...Typography.h3, color: Colors.textPrimary },
  kind: { ...Typography.caption, color: Colors.friends.primary, marginTop: 2 },
  msg: { ...Typography.body, color: Colors.gray700, marginTop: 6 },
  actions: { flexDirection: "row", gap: 10, marginTop: 14 },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: Colors.gray300,
    alignItems: "center",
  },
  btnSecondaryText: { ...Typography.button, color: Colors.textPrimary },
  btnPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: Colors.friends.primary,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  btnPrimaryText: { ...Typography.button, color: Colors.white },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.55 },
});

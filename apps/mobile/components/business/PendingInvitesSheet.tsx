import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Layout } from "@/constants/tokens";
import {
  acceptBusinessConnection,
  declineBusinessConnection,
  listIncomingBusinessInvites,
} from "@/lib/access/businessConnections";
import {
  trackBusinessInviteAccepted,
  trackBusinessInviteDeclined,
} from "@/lib/analytics/businessEvents";
import { trackMatchCreated } from "@/lib/analytics/events";
import type { BusinessInvite } from "@/types/business";

type Props = {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
};

export function PendingInvitesSheet({ visible, onClose, onChanged }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<BusinessInvite[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setInvites(await listIncomingBusinessInvites());
    } catch {
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const handleAccept = async (invite: BusinessInvite) => {
    try {
      const res = await acceptBusinessConnection(invite.id);
      if (!res.ok) {
        Alert.alert("Accept", res.error ?? "Could not accept.");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const daysPending = Math.max(
        0,
        Math.floor((Date.now() - new Date(invite.created_at).getTime()) / 86400000)
      );
      trackBusinessInviteAccepted({ connection_id: invite.id, days_pending: daysPending });
      trackMatchCreated({ mode: "business", source: "invite", match_id: invite.id });
      onChanged();
      onClose();
      if (res.chat_id) {
        router.push({ pathname: "/chats/chat-view", params: { id: res.chat_id } });
      }
    } catch (e) {
      Alert.alert("Accept", e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  const handleDecline = async (invite: BusinessInvite) => {
    try {
      await declineBusinessConnection(invite.id);
      trackBusinessInviteDeclined({ report_filed: false });
      onChanged();
      await load();
    } catch (e) {
      Alert.alert("Decline", e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Connection requests</Text>
          {loading ? (
            <ActivityIndicator color={Colors.business.primary} style={{ marginVertical: 24 }} />
          ) : invites.length === 0 ? (
            <Text style={styles.empty}>No pending requests.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 420 }}>
              {invites.map((invite) => (
                <View key={invite.id} style={styles.card}>
                  <View style={styles.row}>
                    {invite.from_profile.logo_uri ? (
                      <Image source={{ uri: invite.from_profile.logo_uri }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPh]}>
                        <Text style={styles.avatarLetter}>
                          {invite.from_profile.first_name?.slice(0, 1) ?? "?"}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>
                        {[invite.from_profile.first_name, invite.from_profile.last_name]
                          .filter(Boolean)
                          .join(" ") || "Professional"}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {[invite.from_profile.role, invite.from_profile.business_name]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.quote}>
                    <Text style={styles.note}>{invite.note}</Text>
                  </View>
                  <View style={styles.actions}>
                    <Pressable
                      style={styles.acceptBtn}
                      onPress={() => handleAccept(invite)}
                    >
                      <Text style={styles.acceptText}>Accept</Text>
                    </Pressable>
                    <Pressable onPress={() => handleDecline(invite)}>
                      <Text style={styles.declineText}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "85%",
  },
  title: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 12 },
  empty: { ...Typography.body, color: Colors.gray600, paddingVertical: 20 },
  card: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Layout.radii.card,
    padding: 14,
    marginBottom: 12,
  },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPh: {
    backgroundColor: Colors.business.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontWeight: "700", color: Colors.business.primary },
  name: { fontWeight: "700", color: Colors.textPrimary },
  meta: { fontSize: 11, color: Colors.gray600, marginTop: 2 },
  quote: {
    marginTop: 10,
    padding: 10,
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
  },
  note: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  actions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12 },
  acceptBtn: {
    backgroundColor: Colors.business.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Layout.radii.control,
  },
  acceptText: { color: Colors.white, fontWeight: "700" },
  declineText: { color: Colors.gray600, fontWeight: "600" },
  closeBtn: { marginTop: 8, alignItems: "center", paddingVertical: 12 },
  closeText: { color: Colors.business.primary, fontWeight: "600" },
});

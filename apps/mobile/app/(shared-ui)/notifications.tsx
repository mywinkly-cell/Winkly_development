import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read?: boolean;
};

export default function Notifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,created_at,read")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error || !data) {
        setItems([]);
        return;
      }

      setItems(data as NotificationItem[]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: Colors.background }]}>
      <View style={styles.header}>
        <Text style={[Typography.h2, styles.title]}>Notifications</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.primaryViolet} />
            <Text style={{ marginTop: 8, color: Colors.mutedText }}>Loading…</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
            <Text style={{ color: Colors.text, fontWeight: "900" }}>No notifications yet</Text>
            <Text style={{ color: Colors.mutedText, marginTop: 6 }}>
              You’ll see updates about matches, events, and messages here.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {items.map((n) => (
              <View
                key={n.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: Colors.card,
                    borderColor: Colors.border,
                    opacity: n.read ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={{ color: Colors.text, fontWeight: "900" }}>{n.title}</Text>
                <Text style={{ color: Colors.text, marginTop: 6 }}>{n.body}</Text>
                <Text style={{ color: Colors.mutedText, marginTop: 8, fontSize: 12 }}>
                  {new Date(n.created_at).toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles: any = {
  screen: { flex: 1, paddingTop: Layout?.screenTopPadding ?? 16 },
  header: { paddingHorizontal: Layout?.screenPadding ?? 16, paddingBottom: 12 },
  title: { fontWeight: "900" },

  center: { paddingVertical: 40, alignItems: "center" },

  empty: {
    marginHorizontal: Layout?.screenPadding ?? 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 8,
  },

  card: {
    marginHorizontal: Layout?.screenPadding ?? 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
};

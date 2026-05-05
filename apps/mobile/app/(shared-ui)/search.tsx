import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");

  return (
    <View style={[styles.screen, { backgroundColor: Colors.background }]}>
      <View style={styles.header}>
        <Text style={[Typography.h2, styles.title]}>Search</Text>
      </View>

      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
          <Text style={{ color: Colors.mutedText, marginRight: 8 }}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people, events, companies…"
            placeholderTextColor={Colors.mutedText}
            style={[styles.input, { color: Colors.text }]}
            autoCapitalize="none"
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {query.trim().length === 0 ? (
          <View style={styles.hint}>
            <Text style={{ color: Colors.mutedText }}>
              Start typing to search across Winkly.
            </Text>
          </View>
        ) : (
          <View style={styles.hint}>
            <Text style={{ color: Colors.mutedText }}>
              Global search results will appear here.
            </Text>
            <Text style={{ color: Colors.mutedText, marginTop: 6 }}>
              (Mode-specific search routing can be added next.)
            </Text>
          </View>
        )}

        <View style={styles.quickLinks}>
          <Text style={styles.quickTitle}>Quick links</Text>

          {[
            "Romance Discover",
            "Friends Discover",
            "Business Discover",
            "Events Discover",
          ].map((label) => (
            <TouchableOpacity
              key={label}
              style={[styles.quickItem, { backgroundColor: Colors.card, borderColor: Colors.border }]}
            >
              <Text style={{ color: Colors.text }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles: any = {
  screen: { flex: 1, paddingTop: Layout?.screenTopPadding ?? 16 },

  header: { paddingHorizontal: Layout?.screenPadding ?? 16, paddingBottom: 12 },
  title: { fontWeight: "900" },

  searchRow: { paddingHorizontal: Layout?.screenPadding ?? 16, paddingBottom: 10 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 48,
  },
  input: { flex: 1, fontSize: 15 },

  hint: {
    paddingHorizontal: Layout?.screenPadding ?? 16,
    marginTop: 20,
  },

  quickLinks: {
    marginTop: 30,
    paddingHorizontal: Layout?.screenPadding ?? 16,
  },
  quickTitle: { fontWeight: "900", marginBottom: 10, color: Colors.text },
  quickItem: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
};

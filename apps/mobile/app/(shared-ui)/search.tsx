import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={{ color: theme.colors.textSecondary, marginRight: 8 }}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search people, events, companies…"
            placeholderTextColor={theme.colors.textSecondary}
            style={styles.input}
            autoCapitalize="none"
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {query.trim().length === 0 ? (
          <View style={styles.hint}>
            <Text style={{ color: theme.colors.textSecondary }}>
              Start typing to search across Winkly.
            </Text>
          </View>
        ) : (
          <View style={styles.hint}>
            <Text style={{ color: theme.colors.textSecondary }}>
              Global search results will appear here.
            </Text>
            <Text style={{ color: theme.colors.textSecondary, marginTop: 6 }}>
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
              style={styles.quickItem}
            >
              <Text style={{ color: theme.colors.textPrimary }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return {
    screen: { flex: 1, paddingTop: theme.spacing.md, backgroundColor: theme.colors.background },

    header: { paddingHorizontal: theme.spacing.xl, paddingBottom: 12 },
    title: { ...theme.type.h2, fontWeight: "900" as const, color: theme.colors.textPrimary },

    searchRow: { paddingHorizontal: theme.spacing.xl, paddingBottom: 10 },
    searchBox: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 12,
      height: 48,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    input: { flex: 1, fontSize: 15, color: theme.colors.textPrimary },

    hint: {
      paddingHorizontal: theme.spacing.xl,
      marginTop: 20,
    },

    quickLinks: {
      marginTop: 30,
      paddingHorizontal: theme.spacing.xl,
    },
    quickTitle: { fontWeight: "900" as const, marginBottom: 10, color: theme.colors.textPrimary },
    quickItem: {
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
  };
}

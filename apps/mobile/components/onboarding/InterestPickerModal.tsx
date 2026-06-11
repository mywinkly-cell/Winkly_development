import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import {
  INTEREST_CATEGORIES,
  GENERAL_INTERESTS_MAX,
  type InterestOption,
} from "@/constants/interestCategories";

type InterestPickerModalProps = {
  visible: boolean;
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
  max?: number;
  title?: string;
};

/**
 * Category-grouped interest picker shown as a popup. Keeps the General profile
 * interests consistent across modes with a single high-quality selection UI.
 */
export function InterestPickerModal({
  visible,
  selected,
  onChange,
  onClose,
  max = GENERAL_INTERESTS_MAX,
  title = "Your interests",
}: InterestPickerModalProps) {
  const [query, setQuery] = useState("");
  const items = selected ?? [];
  const atMax = items.length >= max;

  const toggle = (label: string) => {
    const has = items.includes(label);
    if (has) {
      onChange(items.filter((x) => x !== label));
      Haptics.selectionAsync();
    } else if (!atMax) {
      onChange([...items, label]);
      Haptics.selectionAsync();
    }
  };

  const categories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return INTEREST_CATEGORIES;
    return INTEREST_CATEGORIES.map((c) => ({
      ...c,
      items: c.items.filter((o) => o.label.toLowerCase().includes(q)),
    })).filter((c) => c.items.length > 0);
  }, [query]);

  const renderChip = (o: InterestOption) => {
    const isSelected = items.includes(o.label);
    const disabled = !isSelected && atMax;
    return (
      <TouchableOpacity
        key={o.label}
        onPress={() => toggle(o.label)}
        disabled={disabled}
        style={[
          styles.chip,
          isSelected && styles.chipSelected,
          disabled && styles.chipDisabled,
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected, disabled }}
        accessibilityLabel={o.label}
      >
        <Text style={styles.chipEmoji}>{o.emoji}</Text>
        <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{o.label}</Text>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={15} color={Colors.white} style={styles.chipCheck} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>
                Pick up to {max} — {items.length}/{max} selected
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={Colors.gray600} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={Colors.gray500} style={{ marginRight: 8 }} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search interests…"
              placeholderTextColor={Colors.gray500}
              style={styles.searchInput}
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.gray400} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            {categories.map((cat) => (
              <View key={cat.name} style={styles.category}>
                <Text style={styles.categoryTitle}>
                  {cat.emoji}  {cat.name}
                </Text>
                <View style={styles.chipRow}>{cat.items.map(renderChip)}</View>
              </View>
            ))}
            {categories.length === 0 && (
              <Text style={styles.empty}>No interests match “{query}”.</Text>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose} style={styles.doneBtn} accessibilityRole="button">
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: Colors.backgroundLight,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  title: {
    ...Typography.h3,
    color: Colors.textSecondary,
    fontFamily: FontFamily.headingBold,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.gray600,
    marginTop: 2,
  },
  closeBtn: { padding: 4 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.textPrimary,
    padding: 0,
  },
  category: { marginBottom: 18 },
  categoryTitle: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  chipSelected: {
    backgroundColor: Colors.primaryViolet,
    borderColor: Colors.primaryViolet,
  },
  chipDisabled: { opacity: 0.4 },
  chipEmoji: { fontSize: 15, marginRight: 6 },
  chipText: { ...Typography.caption, color: Colors.textPrimary },
  chipTextSelected: { color: Colors.white, fontWeight: "600" },
  chipCheck: { marginLeft: 6 },
  empty: {
    ...Typography.body,
    color: Colors.gray500,
    textAlign: "center",
    paddingVertical: 24,
  },
  footer: {
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  doneBtn: {
    backgroundColor: Colors.primaryViolet,
    paddingVertical: 14,
    borderRadius: Layout.radii.control,
    alignItems: "center",
  },
  doneText: {
    ...Typography.button,
    color: Colors.white,
    fontFamily: FontFamily.headingBold,
  },
});

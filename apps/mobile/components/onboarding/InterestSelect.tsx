import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";

type InterestSelectProps = {
  popularOptions: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  max: number;
  placeholder?: string;
};

export function InterestSelect({
  popularOptions,
  selected,
  onChange,
  max,
  placeholder = "Add your own interest…",
}: InterestSelectProps) {
  const [customInput, setCustomInput] = useState("");

  const toggle = (v: string) => {
    const trimmed = v.trim();
    if (!trimmed) return;
    const has = items.includes(trimmed);
    if (has) {
      onChange(items.filter((x) => x !== trimmed));
    } else if (items.length < max) {
      onChange([...items, trimmed]);
    }
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    const normalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    if (items.includes(normalized)) {
      setCustomInput("");
      return;
    }
    if (items.length >= max) return;
    onChange([...items, normalized]);
    setCustomInput("");
  };

  const options = popularOptions ?? [];
  const items = selected ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Popular</Text>
      <View style={styles.chipRow}>
        {options.map((o) => {
          const isSelected = items.includes(o);
          return (
            <TouchableOpacity
              key={o}
              onPress={() => toggle(o)}
              style={[styles.chip, isSelected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{o}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Or add your own</Text>
      <View style={styles.addRow}>
        <TextInput
          value={customInput}
          onChangeText={setCustomInput}
          placeholder={placeholder}
          placeholderTextColor={Colors.gray500}
          onSubmitEditing={addCustom}
          returnKeyType="done"
          style={styles.input}
        />
        <TouchableOpacity
          onPress={addCustom}
          disabled={!customInput.trim() || items.length >= max}
          style={[styles.addBtn, (!customInput.trim() || items.length >= max) && styles.addBtnDisabled]}
        >
          <Ionicons name="add" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {items.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Selected ({items.length}/{max})</Text>
          <View style={styles.chipRow}>
            {items.map((s) => (
              <TouchableOpacity key={s} onPress={() => toggle(s)} style={[styles.chip, styles.chipSelected]}>
                <Text style={styles.chipTextSelected}>{s}</Text>
                <Ionicons name="close-circle" size={16} color={Colors.white} style={styles.removeIcon} />
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: Colors.gray100,
    flexDirection: "row",
    alignItems: "center",
  },
  chipSelected: {
    backgroundColor: Colors.primaryViolet,
  },
  chipText: {
    ...Typography.caption,
    color: Colors.textPrimary,
  },
  chipTextSelected: {
    ...Typography.caption,
    color: Colors.white,
  },
  removeIcon: {
    marginLeft: 4,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryViolet,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
});

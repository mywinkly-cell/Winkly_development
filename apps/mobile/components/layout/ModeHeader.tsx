// ModeHeader — Shared header for mode screens (Discover, Chats, etc.)
// Business: Filter (left) | Winkly (center) | Winkly AI (right) + search + filter chips

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Layout, Shadow, Typography, FontFamily, HEADER } from "@/constants/tokens";
import { WinklyAISpark } from "@/components/ui/WinklyAISpark";
import { BUSINESS_FILTER_CHIPS } from "@/constants/profileOptions";
import type { BusinessChipFilter } from "@/hooks/useBusinessSearch";

type RightSlot = "settings" | "filterSettings" | "filters" | "ai";
type LeftSlot = "filters";
type ModeKey = "romance" | "friends" | "business" | "events";
export type HeaderVariant = "default" | "planner";

type ModeHeaderProps = {
  currentMode: ModeKey;
  leftSlot?: LeftSlot;
  rightSlot?: RightSlot;
  variant?: HeaderVariant;
  onFilterPress?: () => void;
  onSettingsPress?: () => void;
  showSearchBar?: boolean;
  searchValue?: string;
  onSearchChange?: (q: string) => void;
  activeChip?: BusinessChipFilter | null;
  onChipSelect?: (chip: BusinessChipFilter) => void;
  filterBadgeCount?: number;
  onClearFilters?: () => void;
};

export function ModeHeader({
  currentMode,
  leftSlot,
  rightSlot = "settings",
  variant = "default",
  onFilterPress,
  showSearchBar = false,
  searchValue = "",
  onSearchChange,
  activeChip,
  onChipSelect,
  filterBadgeCount = 0,
  onClearFilters,
}: ModeHeaderProps) {
  const router = useRouter();
  const isPlannerHeader = variant === "planner";
  const isBusiness = currentMode === "business";

  const onFilterPressDefault = () => {
    Haptics.selectionAsync();
    router.push("/planner");
  };

  const handleFilterPress = () => {
    Haptics.selectionAsync();
    if ((rightSlot === "filterSettings" || isPlannerHeader) && onFilterPress) {
      onFilterPress();
    } else {
      onFilterPressDefault();
    }
  };

  const handleFiltersOnlyPress = () => {
    Haptics.selectionAsync();
    if (onFilterPress) onFilterPress();
  };

  const handleAiPress = () => {
    Haptics.selectionAsync();
    router.push({
      pathname: "/concierge",
      params: { source_screen: "business_home", mode: "business" },
    });
  };

  if (isPlannerHeader) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          onPress={handleFilterPress}
          style={styles.rightBtn}
          activeOpacity={0.8}
          accessibilityLabel="Planner filters"
        >
          <Ionicons name="filter" size={HEADER.iconSize} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.centerTitleWrap}>
          <Text style={styles.centerTitle}>Winkly</Text>
        </View>
        <View style={styles.placeholder} />
      </View>
    );
  }

  const filterIconColor =
    currentMode === "romance"
      ? Colors.romance.primary
      : currentMode === "friends"
        ? Colors.friends.primary
        : currentMode === "business"
          ? Colors.business.primary
          : Colors.textPrimary;

  const filterButton = (
    <TouchableOpacity
      onPress={handleFiltersOnlyPress}
      style={styles.rightBtn}
      accessibilityLabel="Filtering"
    >
      <Ionicons name="options-outline" size={24} color={filterIconColor} />
      {filterBadgeCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{filterBadgeCount > 9 ? "9+" : filterBadgeCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  const rightContent =
    isBusiness && (rightSlot === "ai" || rightSlot === "filters") ? (
      <View style={styles.aiButton3D}>
        <WinklyAISpark
          feature="smart_matching"
          onPress={handleAiPress}
          size={HEADER.iconSize}
          style={styles.sparkBtn}
          accessibilityLabel="Winkly AI"
        />
      </View>
    ) : leftSlot === "filters" ? (
      <View style={styles.placeholder} />
    ) : rightSlot === "filterSettings" ? (
      <TouchableOpacity onPress={handleFilterPress} style={styles.rightBtn} accessibilityLabel="Planner filters">
        <Ionicons name="filter" size={HEADER.iconSize} color={Colors.textPrimary} />
      </TouchableOpacity>
    ) : rightSlot === "filters" ? (
      filterButton
    ) : (
      <View style={styles.placeholder} />
    );

  const showBusinessChrome = isBusiness && showSearchBar;

  return (
    <View style={styles.wrapper}>
      <View style={[styles.container, showBusinessChrome && styles.containerNoBorder]}>
        {isBusiness && onFilterPress ? filterButton : leftSlot === "filters" && onFilterPress ? filterButton : <View style={styles.placeholder} />}

        <View style={styles.centerTitleWrap}>
          <Text style={styles.centerTitle}>Winkly</Text>
        </View>

        {rightContent}
      </View>

      {showBusinessChrome && currentMode === "business" ? (
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={Colors.gray500} />
            <TextInput
              style={styles.searchInput}
              value={searchValue}
              onChangeText={onSearchChange}
              placeholder="Search name, role, company, skill…"
              placeholderTextColor={Colors.gray500}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searchValue.length > 0 ? (
              <TouchableOpacity
                onPress={() => onSearchChange?.("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color={Colors.gray500} />
              </TouchableOpacity>
            ) : null}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {BUSINESS_FILTER_CHIPS.map((chip) => {
              const active =
                chip.label === "All"
                  ? !activeChip
                  : activeChip?.label === chip.label;
              return (
                <Pressable
                  key={chip.label}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onChipSelect?.(chip);
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
                </Pressable>
              );
            })}
            {onClearFilters ? (
              <Pressable onPress={onClearFilters} style={styles.clearChip}>
                <Text style={styles.clearChipText}>Clear</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    ...Shadow.card,
  },
  container: {
    paddingHorizontal: 16,
    ...Layout.topHeaderBar,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.white,
  },
  containerNoBorder: {
    borderBottomWidth: 0,
  },
  placeholder: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
  },
  centerTitleWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  centerTitle: {
    ...Typography.headerTitle,
    color: Colors.primaryViolet,
    fontFamily: FontFamily.headingBold,
    textAlign: "center",
  },
  rightBtn: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonSize / 2,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.business.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: Colors.white },
  aiButton3D: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonSize / 2,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  sparkBtn: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    marginRight: 0,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: Colors.white,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 36,
    borderRadius: Layout.radii.control,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  chipsRow: { gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  chipActive: {
    backgroundColor: Colors.business.secondary,
    borderColor: Colors.business.primary,
  },
  chipText: { fontSize: 12, color: Colors.gray700, fontWeight: "600" },
  chipTextActive: { color: Colors.business.primary },
  clearChip: { paddingHorizontal: 12, paddingVertical: 6, justifyContent: "center" },
  clearChipText: { fontSize: 12, color: Colors.gray500, fontWeight: "600" },
});

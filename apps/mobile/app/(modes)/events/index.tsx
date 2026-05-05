// ────────────────────────────────────────────────
// Winkly Events Mode – Home Screen (Final v7.0)
// © 2025 Winkly Technologies UG (haftungsbeschränkt)
// Maintainer: Kateryna Shyshkalova
// Purpose: Unified event discovery + filters, AI recommendations,
// organizer tools, event creation, and entry into full event ecosystem.
// Works for:
// - Personal Accounts
// - Personal Accounts w/ Business sub-profile
// - Full Business Accounts
// ────────────────────────────────────────────────

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { ModeBottomBar } from "@/components/layout/ModeBottomBar";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function EventsHome() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>

      {/* HEADER */}
      <ModeHeader currentMode="events" rightSlot="filterSettings" />

      {/* BODY */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 120,
        }}
      >
        {/* TITLE */}
        <Text style={{ ...Typography.h1, color: Colors.textPrimary, marginBottom: 12 }}>
          Discover Events 🎉
        </Text>

        <Text style={{ ...Typography.body, color: Colors.gray700, marginBottom: 24 }}>
          Explore what's happening around you — parties, meetups, masterminds, business events,
          workshops, and exclusive experiences.
        </Text>

        {/* ───────────────────────────────────────────── */}
        {/* SEARCH + FILTER BAR */}
        {/* ───────────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: "#FFF",
            borderRadius: Layout.radii.card,
            padding: 16,
            marginBottom: 24,
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 8,
          }}
        >
          {/* Search */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderColor: Colors.gray300,
              borderRadius: Layout.radii.control,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Ionicons
              name="search-outline"
              size={20}
              color={Colors.gray500}
              style={{ marginRight: 8 }}
            />
            <TextInput
              placeholder="Search events, categories or locations..."
              placeholderTextColor={Colors.gray500}
              style={{
                flex: 1,
                ...Typography.body,
                color: Colors.textPrimary,
              }}
            />
          </View>

          {/* Filters */}
          <View
            style={{
              flexDirection: "row",
              marginTop: 12,
              justifyContent: "space-between",
            }}
          >
            <FilterTag label="Today" />
            <FilterTag label="This week" />
            <FilterTag label="Nearby" />
            <FilterTag label="Workshops" />
          </View>
        </View>

        {/* ───────────────────────────────────────────── */}
        {/* RECOMMENDED EVENTS */}
        {/* ───────────────────────────────────────────── */}
        <SectionCard
          title="Recommended for you"
          subtitle="Based on your interests & location"
          onPress={() => router.push("/(modes)/events/feed/recommended")}
        />

        {/* ───────────────────────────────────────────── */}
        {/* TRENDING EVENTS */}
        {/* ───────────────────────────────────────────── */}
        <SectionCard
          title="Trending now"
          subtitle="Most joined & shared events"
          onPress={() => router.push("/(modes)/events/feed/trending")}
        />

        {/* ───────────────────────────────────────────── */}
        {/* NEAR YOU */}
        {/* ───────────────────────────────────────────── */}
        <SectionCard
          title="Near you"
          subtitle="Events happening close by"
          onPress={() => router.push("/(modes)/events/feed/nearby")}
        />

        {/* ───────────────────────────────────────────── */}
        {/* AI PICKS */}
        {/* ───────────────────────────────────────────── */}
        <SectionCard
          title="AI Picks for you"
          subtitle="Smart suggestions that match your vibe"
          onPress={() => router.push("/(modes)/events/feed/ai")}
          showSparkle
        />

        {/* ───────────────────────────────────────────── */}
        {/* CREATE EVENT — Organizers (Personal or Business) */}
        {/* ───────────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: Colors.primaryViolet,
            borderRadius: Layout.radii.card,
            padding: 20,
            marginTop: 20,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              ...Typography.h3,
              color: Colors.accentYellow,
              marginBottom: 8,
            }}
          >
            Organize your own event
          </Text>

          <Text
            style={{
              ...Typography.caption,
              color: "#FFF",
              marginBottom: 16,
              textAlign: "center",
              lineHeight: 18,
            }}
          >
            Host something exciting — parties, networking dinners, workshops or masterminds.
          </Text>

          <TouchableOpacity
            onPress={() => router.push("/(modes)/events/create")}
            style={{
              backgroundColor: Colors.accentYellow,
              borderRadius: Layout.radii.control,
              paddingVertical: 12,
              paddingHorizontal: 24,
            }}
          >
            <Text style={{ ...Typography.button, color: Colors.primaryViolet }}>
              Create Event
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* BOTTOM BAR — Chats, Planner */}
      <ModeBottomBar mode="events" />
    </View>
  );
}

// ─────────────────────────────────────────────
// SectionCard — for Recommended / Trending / Nearby / AI
// ─────────────────────────────────────────────
function SectionCard({
  title,
  subtitle,
  onPress,
  showSparkle,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  showSparkle?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: "#FFF",
        borderRadius: Layout.radii.card,
        padding: 24,
        marginBottom: 20,
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {showSparkle && (
          <Ionicons name="sparkles" size={20} color={Colors.primaryViolet} />
        )}
        <Text style={{ ...Typography.h3, color: Colors.textPrimary, flex: 1 }}>
          {title}
        </Text>
      </View>
      <Text style={{ ...Typography.caption, color: Colors.gray500, marginTop: 4 }}>
        {subtitle}
      </Text>

      <View style={{ marginTop: 12, alignItems: "flex-start" }}>
        <Text
          style={{
            ...Typography.caption,
            color: Colors.primaryViolet,
            textDecorationLine: "underline",
          }}
        >
          View events →
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// FilterTag — small UI chip for Top Filters
// ─────────────────────────────────────────────
function FilterTag({ label }: { label: string }) {
  return (
    <View
      style={{
        paddingVertical: 6,
        paddingHorizontal: 14,
        backgroundColor: Colors.gray100,
        borderRadius: 20,
      }}
    >
      <Text style={{ ...Typography.caption, color: Colors.textPrimary }}>
        {label}
      </Text>
    </View>
  );
}

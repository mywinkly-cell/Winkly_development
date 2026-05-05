// ────────────────────────────────────────────────
// Winkly Business Mode – Home Screen (Final v7.0)
// © 2025 Winkly Technologies UG (haftungsbeschränkt)
// Maintainer: Kateryna Shyshkalova
// Purpose: Professional networking + business connections,
// company discovery, opportunities, groups, and events.
// Works for:
// 1) Full Business Accounts
// 2) Personal Accounts with Business Sub-Profile enabled
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { ModeBottomBar } from "@/components/layout/ModeBottomBar";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";

export default function BusinessHome() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      
      {/* HEADER */}
      <ModeHeader
        currentMode="business"
        rightSlot="filters"
        onFilterPress={() => router.push("/(modes)/business/filters")}
      />

      {/* CONTENT */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: 120,
        }}
      >
        {/* Title */}
        <Text style={{ ...Typography.h1, color: Colors.textPrimary, marginBottom: 12 }}>
          Grow your network 💼
        </Text>

        <Text style={{ ...Typography.body, color: Colors.gray700, marginBottom: 24 }}>
          Connect with professionals, build partnerships, discover opportunities,
          and attend business events.
        </Text>

        {/* ─────────────────────────────────────── */}
        {/* BUSINESS FEED — Professional Cards */}
        {/* ─────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: "#FFF",
            borderRadius: Layout.radii.card,
            padding: 24,
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 8,
            marginBottom: 20,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>Professionals Near You</Text>
            <SparklesIcon size={18} color={Colors.primaryViolet} />
          </View>
          <Text style={{ ...Typography.caption, color: Colors.gray500, marginTop: 4 }}>
            AI-sorted, swipeable business cards will be here
          </Text>

          <TouchableOpacity
            onPress={() => router.push("/(modes)/business/discover")}
            style={{
              marginTop: 16,
              backgroundColor: Colors.accentNavy,
              borderRadius: Layout.radii.control,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ ...Typography.button, color: "#FFF" }}>
              Open Business Feed
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─────────────────────────────────────── */}
        {/* COMPANIES / BRANDS */}
        {/* ─────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: "#FFF",
            borderRadius: Layout.radii.card,
            padding: 24,
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 8,
            marginBottom: 20,
          }}
        >
          <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>
            Companies & Brands
          </Text>
          <Text style={{ ...Typography.caption, color: Colors.gray500, marginTop: 4 }}>
            Discover verified businesses, startups, and partners
          </Text>

          <TouchableOpacity
            onPress={() => router.push("/(modes)/business/companies/index" as Href)}
            style={{
              marginTop: 16,
              backgroundColor: Colors.accentNavy,
              borderRadius: Layout.radii.control,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ ...Typography.button, color: "#FFF" }}>
              Explore Companies
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─────────────────────────────────────── */}
        {/* OPPORTUNITIES — Jobs, Deals, Collabs */}
        {/* ─────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: "#FFF",
            borderRadius: Layout.radii.card,
            padding: 24,
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 8,
            marginBottom: 20,
          }}
        >
          <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>
            Opportunities
          </Text>
          <Text style={{ ...Typography.caption, color: Colors.gray500, marginTop: 4 }}>
            Freelance gigs, collaboration offers, job matches
          </Text>

          <TouchableOpacity
            onPress={() => router.push("/(modes)/business/opportunities/index" as Href)}
            style={{
              marginTop: 16,
              backgroundColor: Colors.accentNavy,
              borderRadius: Layout.radii.control,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ ...Typography.button, color: "#FFF" }}>
              Browse Opportunities
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─────────────────────────────────────── */}
        {/* GROUPS & CHANNELS (Business Communities) */}
        {/* ─────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: "#FFF",
            borderRadius: Layout.radii.card,
            padding: 24,
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 8,
            marginBottom: 20,
          }}
        >
          <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>
            Communities & Channels
          </Text>
          <Text style={{ ...Typography.caption, color: Colors.gray500, marginTop: 4 }}>
            Join or create professional groups, masterminds, channels
          </Text>

          <TouchableOpacity
            onPress={() => router.push("/(modes)/business/groups/index" as Href)}
            style={{
              marginTop: 16,
              backgroundColor: Colors.accentNavy,
              borderRadius: Layout.radii.control,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ ...Typography.button, color: "#FFF" }}>
              View Groups
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─────────────────────────────────────── */}
        {/* AI SUGGESTIONS */}
        {/* ─────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: "#FFF",
            borderRadius: Layout.radii.card,
            padding: 24,
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <SparklesIcon size={18} color={Colors.primaryViolet} />
            <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>AI Suggested Matches</Text>
          </View>
          <Text style={{ ...Typography.caption, color: Colors.gray500, marginTop: 4 }}>
            Based on skills, interests, location & profile compatibilities
          </Text>
        </View>
      </ScrollView>

      {/* BOTTOM BAR — Chats, Planner */}
      <ModeBottomBar mode="business" />
    </View>
  );
}

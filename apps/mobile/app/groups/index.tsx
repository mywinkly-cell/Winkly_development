import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";

type GroupsMode = "friends" | "business" | "romance" | "events" | undefined;

export default function GroupsIndex() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: GroupsMode }>();

  const title =
    mode === "business" ? "Business Groups" : mode === "friends" ? "Friends Groups" : "Groups";

  const subtitle =
    mode === "business"
      ? "Masterminds, industry circles, founders, hiring & partnerships."
      : mode === "friends"
        ? "Meetups, hobby clubs, local communities and activity circles."
        : "Communities for every connection.";

  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <View style={{ padding: 20, paddingBottom: 12 }}>
        <Text style={{ ...Typography.h1, color: Colors.textPrimary }}>{title}</Text>
        <Text style={{ ...Typography.body, color: Colors.gray700, marginTop: 6 }}>
          {subtitle}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <View
          style={{
            backgroundColor: "#FFF",
            borderRadius: Layout.radii.card,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>
            Your groups (placeholder)
          </Text>
          <Text style={{ ...Typography.caption, color: Colors.gray700, marginTop: 4 }}>
            This will show joined groups once backend is connected.
          </Text>

          <TouchableOpacity
            onPress={() => router.push({ pathname: "/groups/create-group", params: { mode } })}
            style={{
              marginTop: 12,
              borderRadius: Layout.radii.control,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: Colors.primaryViolet,
            }}
          >
            <Text style={{ ...Typography.button, color: "#FFF" }}>Create a group</Text>
          </TouchableOpacity>
        </View>

        <View
          style={{
            backgroundColor: "#FFF",
            borderRadius: Layout.radii.card,
            padding: 16,
          }}
        >
          <Text style={{ ...Typography.h3, color: Colors.textPrimary }}>
            Discover groups (placeholder)
          </Text>
          <Text style={{ ...Typography.caption, color: Colors.gray700, marginTop: 4 }}>
            Later: search + filters by topic, location, and activity type.
          </Text>

          <TouchableOpacity
            onPress={() =>
              router.push({ pathname: "/groups/group-details", params: { id: "demo", mode } })
            }
            style={{
              marginTop: 12,
              borderRadius: Layout.radii.control,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: Colors.gray100,
            }}
          >
            <Text style={{ ...Typography.button, color: Colors.textPrimary }}>
              Open demo group details
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

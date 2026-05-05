// EventParticipantCard — Shows main card info for event participants
// Photo, name, age, location, occupation (used on event details & planner)

import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";

function getAge(birthday: string | Date | null): number | null {
  if (!birthday) return null;
  const d = typeof birthday === "string" ? new Date(birthday) : birthday;
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

export type ParticipantInfo = {
  id: string;
  firstName: string;
  photoUrl?: string | null;
  birthday?: string | null;
  city?: string | null;
  occupation?: string | null;
  isOrganizer?: boolean;
};

type EventParticipantCardProps = {
  participant: ParticipantInfo;
};

export function EventParticipantCard({ participant }: EventParticipantCardProps) {
  const age = getAge(participant.birthday ?? null);
  const name = participant.firstName?.trim() || "Anonymous";

  return (
    <View style={styles.card}>
      <View style={styles.avatarWrap}>
        {participant.photoUrl ? (
          <Image source={{ uri: participant.photoUrl }} style={styles.avatar} resizeMode="cover" />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={28} color={Colors.gray500} />
          </View>
        )}
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{name}{age != null ? `, ${age}` : ""}</Text>
          {participant.isOrganizer && (
            <View style={styles.organizerBadge}>
              <Text style={styles.organizerText}>Host</Text>
            </View>
          )}
        </View>
        {participant.city ? <Text style={styles.city}>{participant.city}</Text> : null}
        {participant.occupation ? <Text style={styles.occupation}>{participant.occupation}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.control,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  info: { flex: 1 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  organizerBadge: {
    backgroundColor: Colors.events.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  organizerText: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.events.primary,
    fontSize: 11,
  },
  city: {
    ...Typography.caption,
    color: Colors.gray600,
    marginTop: 2,
  },
  occupation: {
    ...Typography.caption,
    color: Colors.gray600,
    marginTop: 2,
  },
});

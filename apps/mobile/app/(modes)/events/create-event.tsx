import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Colors, Typography, Layout } from "@/constants/tokens";

type CreateEventPayload = {
  title: string;
  description: string | null;
  city: string | null;
  venue_name: string | null;
  start_at: string; // timestamptz ISO
  end_at: string | null; // timestamptz ISO
  cover_url: string | null;

  category: string | null;
  tags: string[] | null;

  capacity: number | null;
  price_eur: number | null;

  visibility: "public" | "private";
};

const EVENT_TITLE_MAX_LENGTH = 40;
const EVENT_TOPIC_CATEGORY_MAX_LENGTH = 25;

function toIntOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function toFloatOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

export default function CreateEvent() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [city, setCity] = useState("Munich");
  const [venueName, setVenueName] = useState("");
  const [coverUrl, setCoverUrl] = useState("");

  const [startAt, setStartAt] = useState(() => {
    // Default: today 19:00 local -> ISO string
    const d = new Date();
    d.setHours(19, 0, 0, 0);
    return d.toISOString();
  });
  const [endAt, setEndAt] = useState("");

  const [category, setCategory] = useState("Social");
  const [tags, setTags] = useState("networking, dating, friends");

  const [capacity, setCapacity] = useState("30");
  const [price, setPrice] = useState(""); // EUR

  const [visibility, setVisibility] = useState<CreateEventPayload["visibility"]>("public");

  const [saving, setSaving] = useState(false);

  const startLabel = useMemo(() => startAt.replace("T", " ").replace("Z", "Z"), [startAt]);

  const onSave = async () => {
    const t = title.trim();
    if (!t) {
      Alert.alert("Create event", "Please add a title.");
      return;
    }

    const userRes = await supabase.auth.getUser();
    const user = userRes.data.user;

    if (!user) {
      Alert.alert("Create event", "Please sign in to create events.");
      return;
    }

    const payload: CreateEventPayload & { created_by: string } = {
      title: t,
      description: description.trim() ? description.trim() : null,
      city: city.trim() ? city.trim() : null,
      venue_name: venueName.trim() ? venueName.trim() : null,
      start_at: startAt,
      end_at: endAt.trim() ? endAt.trim() : null,
      cover_url: coverUrl.trim() ? coverUrl.trim() : null,

      category: category.trim() ? category.trim() : null,
      tags: tags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),

      capacity: toIntOrNull(capacity),
      price_eur: toFloatOrNull(price),

      visibility,
      created_by: user.id,
    };

    try {
      setSaving(true);

      // Expected table: events
      // (id uuid PK, created_by uuid, title text, description text, city text,
      //  venue_name text, start_at timestamptz, end_at timestamptz, cover_url text,
      //  category text, tags text[], capacity int, price_eur numeric, visibility text, created_at timestamptz)
      const { data, error } = await supabase
        .from("events")
        .insert(payload as any)
        .select("id")
        .single();

      if (error) {
        if (Platform.OS !== "web") {
          Alert.alert(
            "Create event",
            "Couldn’t create event yet. Add the events table + RLS, then try again."
          );
        }
        return;
      }

      const eventId = data?.id;
      Alert.alert("Event created", "Your event was created successfully.");
      router.replace({
        pathname: "/(modes)/events/event-details",
        params: { event_id: eventId },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: Colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: Colors.card, borderColor: Colors.border }]}
          activeOpacity={0.9}
        >
          <Text style={{ color: Colors.text, fontWeight: "900" }}>‹</Text>
        </TouchableOpacity>

        <Text style={[styles.title, Typography.h2]}>Create Event</Text>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[styles.card, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
          <Text style={[styles.label, { color: Colors.mutedText }]}>Title *</Text>
          <View style={[styles.inputBox, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
            <TextInput
              value={title}
              onChangeText={(t) => setTitle(t.slice(0, EVENT_TITLE_MAX_LENGTH))}
              placeholder="e.g., Winkly Rooftop Networking Night"
              placeholderTextColor={Colors.mutedText}
              style={[styles.input, { color: Colors.text }]}
              returnKeyType="next"
              maxLength={EVENT_TITLE_MAX_LENGTH}
            />
          </View>
          <Text style={[styles.hint, { color: Colors.mutedText }]}>{title.length}/{EVENT_TITLE_MAX_LENGTH} characters</Text>

          <Text style={[styles.label, { color: Colors.mutedText, marginTop: 12 }]}>Description</Text>
          <View style={[styles.textArea, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What’s the vibe? Who is it for? Dress code?"
              placeholderTextColor={Colors.mutedText}
              style={[styles.input, { color: Colors.text, height: 90 }]}
              multiline
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: Colors.mutedText }]}>City</Text>
              <View style={[styles.inputBox, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                  placeholderTextColor={Colors.mutedText}
                  style={[styles.input, { color: Colors.text }]}
                />
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: Colors.mutedText }]}>Venue</Text>
              <View style={[styles.inputBox, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
                <TextInput
                  value={venueName}
                  onChangeText={setVenueName}
                  placeholder="Venue name"
                  placeholderTextColor={Colors.mutedText}
                  style={[styles.input, { color: Colors.text }]}
                />
              </View>
            </View>
          </View>

          <Text style={[styles.label, { color: Colors.mutedText, marginTop: 12 }]}>Cover image URL (optional)</Text>
          <View style={[styles.inputBox, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
            <TextInput
              value={coverUrl}
              onChangeText={setCoverUrl}
              placeholder="https://..."
              placeholderTextColor={Colors.mutedText}
              style={[styles.input, { color: Colors.text }]}
              autoCapitalize="none"
            />
          </View>

          <Text style={[styles.label, { color: Colors.mutedText, marginTop: 12 }]}>Start time (ISO)</Text>
          <View style={[styles.inputBox, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
            <TextInput
              value={startAt}
              onChangeText={setStartAt}
              placeholder="2026-01-10T18:00:00.000Z"
              placeholderTextColor={Colors.mutedText}
              style={[styles.input, { color: Colors.text }]}
              autoCapitalize="none"
            />
          </View>
          <Text style={{ color: Colors.mutedText, marginTop: 6 }}>Preview: {startLabel}</Text>

          <Text style={[styles.label, { color: Colors.mutedText, marginTop: 12 }]}>End time (ISO, optional)</Text>
          <View style={[styles.inputBox, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
            <TextInput
              value={endAt}
              onChangeText={setEndAt}
              placeholder="2026-01-10T22:00:00.000Z"
              placeholderTextColor={Colors.mutedText}
              style={[styles.input, { color: Colors.text }]}
              autoCapitalize="none"
            />
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: Colors.mutedText }]}>Category / Topic</Text>
              <View style={[styles.inputBox, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
                <TextInput
                  value={category}
                  onChangeText={(t) => setCategory(t.slice(0, EVENT_TOPIC_CATEGORY_MAX_LENGTH))}
                  placeholder="Social / Business / Fitness / Culture (up to 25)"
                  placeholderTextColor={Colors.mutedText}
                  style={[styles.input, { color: Colors.text }]}
                  maxLength={EVENT_TOPIC_CATEGORY_MAX_LENGTH}
                />
              </View>
              <Text style={[styles.hint, { color: Colors.mutedText }]}>{category.length}/{EVENT_TOPIC_CATEGORY_MAX_LENGTH} characters</Text>
            </View>
            <View style={{ width: 120 }}>
              <Text style={[styles.label, { color: Colors.mutedText }]}>Capacity</Text>
              <View style={[styles.inputBox, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
                <TextInput
                  value={capacity}
                  onChangeText={setCapacity}
                  keyboardType="number-pad"
                  placeholder="30"
                  placeholderTextColor={Colors.mutedText}
                  style={[styles.input, { color: Colors.text }]}
                />
              </View>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: Colors.mutedText }]}>Tags</Text>
              <View style={[styles.inputBox, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
                <TextInput
                  value={tags}
                  onChangeText={setTags}
                  placeholder="networking, dating, friends"
                  placeholderTextColor={Colors.mutedText}
                  style={[styles.input, { color: Colors.text }]}
                />
              </View>
            </View>
            <View style={{ width: 120 }}>
              <Text style={[styles.label, { color: Colors.mutedText }]}>Price (€)</Text>
              <View style={[styles.inputBox, { borderColor: Colors.border, backgroundColor: Colors.background }]}>
                <TextInput
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.mutedText}
                  style={[styles.input, { color: Colors.text }]}
                />
              </View>
            </View>
          </View>

          <Text style={[styles.label, { color: Colors.mutedText, marginTop: 12 }]}>Visibility</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => setVisibility("public")}
              style={[
                styles.chip,
                {
                  backgroundColor: visibility === "public" ? Colors.primary : Colors.background,
                  borderColor: Colors.border,
                },
              ]}
              activeOpacity={0.9}
            >
              <Text style={{ color: visibility === "public" ? Colors.onPrimary : Colors.text, fontWeight: "700" }}>
                Public
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setVisibility("private")}
              style={[
                styles.chip,
                {
                  backgroundColor: visibility === "private" ? Colors.primary : Colors.background,
                  borderColor: Colors.border,
                },
              ]}
              activeOpacity={0.9}
            >
              <Text style={{ color: visibility === "private" ? Colors.onPrimary : Colors.text, fontWeight: "700" }}>
                Private
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={onSave}
            disabled={saving}
            style={[styles.cta, { backgroundColor: Colors.primary, opacity: saving ? 0.7 : 1 }]}
            activeOpacity={0.9}
          >
            {saving ? <ActivityIndicator /> : <Text style={{ color: Colors.onPrimary, fontWeight: "900" }}>Create</Text>}
          </TouchableOpacity>

          <Text style={{ color: Colors.mutedText, marginTop: 10, lineHeight: 18 }}>
            Note: Start/End fields are ISO for now (DB-friendly). You can add a date/time picker later without changing the
            backend shape.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles: any = {
  screen: { flex: 1, paddingTop: Layout?.screenTopPadding ?? 16 },
  header: {
    paddingHorizontal: Layout?.screenPadding ?? 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontWeight: "900" },

  card: {
    marginHorizontal: Layout?.screenPadding ?? 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginTop: 8,
  },
  label: { fontSize: 12, fontWeight: "700" },
  hint: { fontSize: 11, marginTop: 4, marginBottom: 0 },
  inputBox: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, height: 46, justifyContent: "center" },
  textArea: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 },
  input: { fontSize: 15 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  cta: { marginTop: 16, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
};

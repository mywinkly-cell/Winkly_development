import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Image,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { BusinessBottomNav } from "@/components/layout/BusinessBottomNav";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { ACTIVITY_PREFERENCE_OPTIONS } from "@/constants/profileOptions";
import { supabase } from "@/lib/supabase";
import { getOwnProfileBusiness } from "@/lib/access/profiles";
import { createBusinessOffer } from "@/lib/business/offersStore";
import { pickAndUploadOfferImage } from "@/lib/uploadOfferImage";

const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
const BUDGET_OPTIONS = [
  { label: "€25", cents: 2500 },
  { label: "€50", cents: 5000 },
  { label: "€100", cents: 10000 },
  { label: "€250", cents: 25000 },
] as const;

type FormStep = 1 | 2 | 3;

export default function CreateBusinessOffer() {
  const router = useRouter();
  const primary = Colors.business.primary;
  const [step, setStep] = useState<FormStep>(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [bookingUrl, setBookingUrl] = useState("");
  const [categoryTags, setCategoryTags] = useState<string[]>([]);
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [budgetCents, setBudgetCents] = useState(5000);

  const toggleTag = (key: string) => {
    setCategoryTags((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : prev.length < 10 ? [...prev, key] : prev
    );
  };

  const pickImage = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    setUploading(true);
    const url = await pickAndUploadOfferImage(uid);
    if (url) setImageUrl(url);
    setUploading(false);
  };

  const goNext = () => {
    if (step === 1) {
      if (!title.trim()) {
        Alert.alert("Title required", "Give your offer a clear title.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (categoryTags.length === 0) {
        Alert.alert("Categories required", "Pick at least one activity category so Winkly can match the right people.");
        return;
      }
      setStep(3);
    }
  };

  const submit = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      Alert.alert("Sign in required");
      return;
    }
    setSaving(true);
    const profile = await getOwnProfileBusiness(uid);
    const parseDate = (s: string) => (s.trim() ? new Date(s.trim()).toISOString() : null);
    const result = await createBusinessOffer(
      uid,
      {
        title,
        description,
        image_url: imageUrl,
        booking_url: bookingUrl,
        category_tags: categoryTags,
        valid_from: parseDate(validFrom),
        valid_to: parseDate(validTo),
        radius_km: radiusKm,
        budget_cents: budgetCents,
      },
      profile?.location ?? null
    );
    setSaving(false);
    if ("error" in result) {
      Alert.alert("Could not create offer", result.error);
      return;
    }
    Alert.alert("Offer live", "Your offer is active. Winkly AI will only show it when it matches a couple's interests and location.");
    router.back();
  };

  return (
    <View style={styles.screen}>
      <ModeHeader currentMode="business" leftSlot="filters" rightSlot="ai" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => (step > 1 ? setStep((step - 1) as FormStep) : router.back())} style={styles.backRow}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          <Text style={styles.backText}>{step > 1 ? "Back" : "Cancel"}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Create offer</Text>
        <Text style={styles.subtitle}>Step {step} of 3</Text>

        {step === 1 && (
          <>
            <Text style={styles.label}>Title *</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="e.g. 20% off date-night tasting menu" style={styles.input} />
            <Text style={styles.label}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What makes this offer special?"
              multiline
              style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
            />
            <Text style={styles.label}>Photo</Text>
            <TouchableOpacity onPress={pickImage} style={styles.imagePicker} disabled={uploading}>
              {uploading ? (
                <ActivityIndicator color={primary} />
              ) : imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
              ) : (
                <Text style={styles.imagePlaceholder}>Tap to add photo</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.label}>Booking URL</Text>
            <TextInput
              value={bookingUrl}
              onChangeText={setBookingUrl}
              placeholder="https://..."
              autoCapitalize="none"
              keyboardType="url"
              style={styles.input}
            />
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.label}>Activity categories *</Text>
            <Text style={styles.hint}>Must overlap with user activity preferences for AI matching.</Text>
            <View style={styles.tagGrid}>
              {ACTIVITY_PREFERENCE_OPTIONS.map((opt) => {
                const on = categoryTags.includes(opt.key);
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => toggleTag(opt.key)}
                    style={[styles.tagChip, on && { borderColor: primary, backgroundColor: primary + "18" }]}
                  >
                    <Text style={styles.tagEmoji}>{opt.emoji}</Text>
                    <Text style={[styles.tagLabel, on && { color: primary, fontWeight: "700" }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.label}>Valid from (YYYY-MM-DD)</Text>
            <TextInput value={validFrom} onChangeText={setValidFrom} placeholder="2026-06-01" style={styles.input} />
            <Text style={styles.label}>Valid to (YYYY-MM-DD)</Text>
            <TextInput value={validTo} onChangeText={setValidTo} placeholder="2026-12-31" style={styles.input} />
            <Text style={styles.label}>Radius</Text>
            <View style={styles.radiusRow}>
              {RADIUS_OPTIONS.map((km) => (
                <TouchableOpacity
                  key={km}
                  onPress={() => setRadiusKm(km)}
                  style={[styles.radiusChip, radiusKm === km && styles.radiusChipOn]}
                >
                  <Text style={[styles.radiusText, radiusKm === km && styles.radiusTextOn]}>{km} km</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.label}>Ad budget</Text>
            <Text style={styles.hint}>Higher budgets get priority in AI concierge (billing coming soon).</Text>
            <View style={styles.radiusRow}>
              {BUDGET_OPTIONS.map((b) => (
                <TouchableOpacity
                  key={b.cents}
                  onPress={() => setBudgetCents(b.cents)}
                  style={[styles.radiusChip, budgetCents === b.cents && styles.radiusChipOn]}
                >
                  <Text style={[styles.radiusText, budgetCents === b.cents && styles.radiusTextOn]}>{b.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>{title}</Text>
              <Text style={styles.summaryMeta}>
                {categoryTags.length} categories · {radiusKm} km radius · €{(budgetCents / 100).toFixed(0)} budget
              </Text>
            </View>
          </>
        )}

        <TouchableOpacity
          onPress={step < 3 ? goNext : submit}
          disabled={saving}
          style={[styles.cta, { backgroundColor: primary, opacity: saving ? 0.7 : 1 }]}
        >
          <Text style={styles.ctaText}>{saving ? "Publishing…" : step < 3 ? "Continue" : "Publish offer"}</Text>
        </TouchableOpacity>
      </ScrollView>
      <BusinessBottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  scroll: { paddingHorizontal: Layout.screenPadding, paddingBottom: 120 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginVertical: 12 },
  backText: { ...Typography.body, color: Colors.textPrimary },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { ...Typography.body, color: Colors.gray600, marginBottom: 20 },
  label: { ...Typography.body, fontWeight: "600", color: Colors.gray700, marginBottom: 6, marginTop: 8 },
  hint: { ...Typography.caption, color: Colors.gray500, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Layout.radii.control,
    padding: 12,
    backgroundColor: "#FFF",
    marginBottom: 8,
  },
  imagePicker: {
    height: 160,
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    overflow: "hidden",
  },
  imagePreview: { width: "100%", height: "100%" },
  imagePlaceholder: { color: Colors.gray500 },
  tagGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gray300,
    backgroundColor: "#FFF",
  },
  tagEmoji: { fontSize: 16 },
  tagLabel: { fontSize: 13, color: Colors.textPrimary },
  radiusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  radiusChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gray300,
    backgroundColor: "#FFF",
  },
  radiusChipOn: { borderColor: Colors.business.primary, backgroundColor: Colors.business.primary + "18" },
  radiusText: { color: Colors.textPrimary, fontSize: 14 },
  radiusTextOn: { color: Colors.business.primary, fontWeight: "700" },
  summary: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 14,
    marginBottom: 16,
  },
  summaryTitle: { ...Typography.h3, color: Colors.textPrimary },
  summaryMeta: { ...Typography.caption, color: Colors.gray600, marginTop: 4 },
  cta: {
    borderRadius: Layout.radii.control,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  ctaText: { ...Typography.button, color: "#FFF" },
});

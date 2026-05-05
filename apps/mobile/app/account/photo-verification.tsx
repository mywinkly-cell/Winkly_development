// Photo verification — selfie vs profile photo (Edge Function + optional AWS Rekognition).

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { decode } from "base64-arraybuffer";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { useAuth } from "@/providers";
import { supabase } from "@/lib/supabase";
import { submitPhotoVerification } from "@/lib/safety/photoVerification";
import { getOwnProfileCore } from "@/lib/access/profiles";

export default function PhotoVerificationScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [lastStatus, setLastStatus] = useState<string | null>(null);

  const runVerification = async () => {
    if (!user?.id) return;
    setBusy(true);
    setLastStatus(null);
    try {
      const core = await getOwnProfileCore(user.id);
      const photos = core?.core_photos ?? [];
      if (!photos.length) {
        Alert.alert("Add a photo", "Add a main profile photo first, then verify.");
        setBusy(false);
        return;
      }

      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Camera", "Camera access is needed for a quick selfie check.");
        setBusy(false);
        return;
      }

      const shot = await ImagePicker.launchCameraAsync({
        quality: 0.85,
        base64: true,
      });
      if (shot.canceled || !shot.assets?.[0]?.base64) {
        setBusy(false);
        return;
      }

      const filename = `verification_${Date.now()}.jpg`;
      const filePath = `${user.id}/verification/${filename}`;
      const { error: upErr } = await supabase.storage
        .from("user-photos")
        .upload(filePath, decode(shot.assets[0].base64), { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;

      const row = await submitPhotoVerification(filePath, 0);
      setLastStatus(row.status);
      if (row.status === "verified") {
        Alert.alert("Verified", "Your photo check completed.");
      } else if (row.status === "pending") {
        Alert.alert("Pending", "Verification is queued or awaiting provider configuration.");
      } else {
        Alert.alert("Could not verify", "Try again in good lighting, facing the camera.");
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Photo verification</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.lead}>
          Take a live selfie. We compare it to your profile photo using our verification service (AWS Rekognition when
          configured on the backend).
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, busy && styles.disabled]}
          onPress={runVerification}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="scan-outline" size={22} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>Start verification</Text>
            </>
          )}
        </TouchableOpacity>

        {lastStatus ? (
          <Text style={styles.status}>Last result: {lastStatus}</Text>
        ) : null}
      </ScrollView>
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
  scroll: { padding: 20, paddingBottom: 40 },
  lead: { ...Typography.body, color: Colors.gray700, marginBottom: 20, lineHeight: 22 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primaryViolet,
    paddingVertical: 14,
    borderRadius: Layout.radii.card,
  },
  primaryBtnText: { ...Typography.body, color: "#FFF", fontWeight: "700" },
  disabled: { opacity: 0.7 },
  status: { ...Typography.caption, color: Colors.gray600, marginTop: 16 },
});

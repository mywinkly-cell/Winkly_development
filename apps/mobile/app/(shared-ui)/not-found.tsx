import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View style={[styles.screen, { backgroundColor: Colors.background }]}>
      <Text style={[Typography.h1, styles.title]}>Oops 👀</Text>

      <Text style={styles.text}>
        The page you’re looking for doesn’t exist or has been moved.
      </Text>

      <TouchableOpacity
        onPress={() => router.replace("/")}
        style={[styles.btn, { backgroundColor: Colors.primary }]}
        activeOpacity={0.9}
      >
        <Text style={styles.btnText}>Go to home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles: any = {
  screen: {
    flex: 1,
    paddingTop: Layout?.screenTopPadding ?? 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout?.screenPadding ?? 16,
  },
  title: { fontWeight: "900", marginBottom: 10, color: Colors.text },
  text: { color: Colors.mutedText, textAlign: "center", marginBottom: 20 },
  btn: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 30 },
  btnText: { color: Colors.onPrimary, fontWeight: "900" },
};

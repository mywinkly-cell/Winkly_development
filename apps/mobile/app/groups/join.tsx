/**
 * Deep-link target for group invite links: winkly://groups/join?code=XXXX
 * Joins the group by code (enforces the member cap) and opens the group chat.
 * If the user isn't signed in yet, we stash the code and route them to auth; the
 * link can be re-opened after sign-up to complete the join.
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { joinGroupByCode } from "@/lib/groups/groupsApi";
import { ensureGroupConversation } from "@/lib/groups/groupChat";

const PENDING_KEY = "winkly_pending_group_invite_code";

export default function JoinGroupByCode() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [state, setState] = useState<"loading" | "needs_auth" | "error">("loading");
  const [message, setMessage] = useState<string>("Joining group…");

  const run = useCallback(async () => {
    const c = typeof code === "string" ? code.trim() : "";
    if (!c) {
      setState("error");
      setMessage("This invite link is invalid.");
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      await AsyncStorage.setItem(PENDING_KEY, c).catch(() => {});
      setState("needs_auth");
      return;
    }
    try {
      const groupId = await joinGroupByCode(c);
      await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
      const convId = await ensureGroupConversation(groupId);
      router.replace({ pathname: "/chats/[conversationId]", params: { conversationId: convId } });
    } catch (e) {
      setState("error");
      setMessage((e as Error)?.message ?? "Could not join this group.");
    }
  }, [code, router]);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <View style={styles.screen}>
      {state === "loading" ? (
        <>
          <ActivityIndicator size="large" color={Colors.primaryViolet} />
          <Text style={styles.text}>{message}</Text>
        </>
      ) : state === "needs_auth" ? (
        <>
          <Text style={styles.title}>Sign in to join</Text>
          <Text style={styles.text}>Create an account or sign in, then re-open the invite link to join the group.</Text>
          <TouchableOpacity onPress={() => router.replace("/(auth)/signin")} style={styles.btn} activeOpacity={0.9}>
            <Text style={styles.btnText}>Get started</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.title}>Can&apos;t join</Text>
          <Text style={styles.text}>{message}</Text>
          <TouchableOpacity onPress={() => router.replace("/")} style={styles.btn} activeOpacity={0.9}>
            <Text style={styles.btnText}>Go home</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 8, textAlign: "center" },
  text: { ...Typography.body, color: Colors.gray700, marginTop: 12, textAlign: "center" },
  btn: {
    marginTop: 20,
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  btnText: { ...Typography.button, color: "#FFF" },
});

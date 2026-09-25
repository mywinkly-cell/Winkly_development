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
import { useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { supabase } from "@/lib/supabase";
import { joinGroupByCode } from "@/lib/groups/groupsApi";
import { ensureGroupConversation } from "@/lib/groups/groupChat";

const PENDING_KEY = "winkly_pending_group_invite_code";

export default function JoinGroupByCode() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [state, setState] = useState<"loading" | "needs_auth" | "error">("loading");
  const [message, setMessage] = useState<string>(() => t("groups.join.joining"));

  const run = useCallback(async () => {
    const c = typeof code === "string" ? code.trim() : "";
    if (!c) {
      setState("error");
      setMessage(t("groups.join.invalidLink"));
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
      setMessage((e as Error)?.message ?? t("groups.join.failed"));
    }
  }, [code, router, t]);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <View style={styles.screen}>
      {state === "loading" ? (
        <>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.text}>{message}</Text>
        </>
      ) : state === "needs_auth" ? (
        <>
          <Text style={styles.title}>{t("groups.join.signInTitle")}</Text>
          <Text style={styles.text}>{t("groups.join.signInBody")}</Text>
          <TouchableOpacity onPress={() => router.replace("/(auth)/signin")} style={styles.btn} activeOpacity={0.9}>
            <Text style={styles.btnText}>{t("groups.join.getStarted")}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.title}>{t("groups.join.cantJoin")}</Text>
          <Text style={styles.text}>{message}</Text>
          <TouchableOpacity onPress={() => router.replace("/")} style={styles.btn} activeOpacity={0.9}>
            <Text style={styles.btnText}>{t("groups.join.goHome")}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center", padding: 24 },
    title: { ...theme.type.h2, color: theme.colors.textPrimary, marginBottom: 8, textAlign: "center" },
    text: { ...theme.type.body, color: theme.colors.textSecondary, marginTop: 12, textAlign: "center" },
    btn: {
      marginTop: 20,
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      paddingHorizontal: 28,
    },
    btnText: { ...theme.type.button, color: theme.colors.onPrimary },
  });
}

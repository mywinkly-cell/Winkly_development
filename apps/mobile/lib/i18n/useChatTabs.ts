import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  buildChatTabConfig,
  getChatTabsWithModeFirst,
  type ChatTabKey,
} from "@/lib/chats/chatTabs";

/** Chat inbox tab bar labels — re-computed when app language changes. */
export function useChatTabConfig() {
  const { t, i18n } = useTranslation();
  return useMemo(() => buildChatTabConfig(t), [t, i18n.language]);
}

export function useChatTabsWithModeFirst(
  sourceMode: "romance" | "friends" | "business" | "events" | "all"
) {
  const { t, i18n } = useTranslation();
  return useMemo(
    () => getChatTabsWithModeFirst(sourceMode, t),
    [sourceMode, t, i18n.language]
  );
}


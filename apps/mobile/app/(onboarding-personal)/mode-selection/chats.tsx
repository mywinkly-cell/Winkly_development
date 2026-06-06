import { useEffect } from "react";
import { useRouter } from "expo-router";
import { Routes } from "@/constants/routes";

export default function LegacyModeSelectionChats() {
  const router = useRouter();
  useEffect(() => {
    router.replace(Routes.chats);
  }, [router]);
  return null;
}

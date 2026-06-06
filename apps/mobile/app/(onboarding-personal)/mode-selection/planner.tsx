import { useEffect } from "react";
import { useRouter } from "expo-router";
import { Routes } from "@/constants/routes";

export default function LegacyModeSelectionPlanner() {
  const router = useRouter();
  useEffect(() => {
    router.replace(Routes.planner);
  }, [router]);
  return null;
}

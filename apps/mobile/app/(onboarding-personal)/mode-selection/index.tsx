import { useEffect } from "react";
import { useRouter } from "expo-router";
import { Routes } from "@/constants/routes";

/** Legacy path — replace in an effect to avoid Redirect/layout update loops. */
export default function LegacyModeSelectionIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace(Routes.modeSelection);
  }, [router]);
  return null;
}

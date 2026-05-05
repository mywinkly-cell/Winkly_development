import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function BusinessGroupsEntry() {
  const router = useRouter();

  useEffect(() => {
    router.replace({ pathname: "/groups", params: { mode: "business" } });
  }, [router]);

  return null;
}

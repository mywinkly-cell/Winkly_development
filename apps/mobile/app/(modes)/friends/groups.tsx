import React, { useEffect } from "react";
import { useRouter } from "expo-router";

export default function FriendsGroupsEntry() {
  const router = useRouter();

  useEffect(() => {
    router.replace({ pathname: "/groups", params: { mode: "friends" } });
  }, [router]);

  return null;
}

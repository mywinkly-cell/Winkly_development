import type { Router } from "expo-router";

type PeerProfileMode = "romance" | "friends" | "business" | "events";

/** Open another user's mode sub-profile from chat surfaces. */
export function openPeerProfile(router: Router, peerId: string, mode: PeerProfileMode) {
  if (mode === "romance") {
    router.push(`/(modes)/romance/profile-view?id=${encodeURIComponent(peerId)}`);
    return;
  }
  router.push(`/(modes)/${mode}/profile-view?user_id=${encodeURIComponent(peerId)}`);
}

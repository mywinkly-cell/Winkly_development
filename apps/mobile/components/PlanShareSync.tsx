// apps/mobile/components/PlanShareSync.tsx
// Turns shareable-plan invitations into normal participations. Renders nothing.
//  • Once per signed-in user with a confirmed email: web "I'm in" RSVPs given with this (confirmed) email before the
//    account existed become planner participations (claim_plan_share_rsvps).
//  • A plan link opened in the app (https://mywinkly.de/app/p/<token>, parked by app/app/[...rest])
//    is joined as soon as there's a session, then the plan opens in the Planner.
// See docs/PLAN_SHARING.md.

import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/providers/AuthProvider";
import { Routes } from "@/constants/routes";
import {
  acceptPlanShare,
  claimPlanShareRsvps,
  clearPendingPlanShareToken,
  getPendingPlanShareToken,
  isRecentSignup,
  subscribePendingPlanShareToken,
  type AcceptPlanShareStatus,
} from "@/lib/planShare";
import { trackShareRsvpConverted, trackSignupFromShare } from "@/lib/analytics/events";

const PROBLEM_KEY: Partial<Record<AcceptPlanShareStatus, string>> = {
  full: "planShare.linkFull",
  expired: "planShare.linkExpired",
  revoked: "planShare.linkRevoked",
  unavailable: "planShare.linkUnavailable",
  not_found: "planShare.linkNotFound",
  error: "planShare.linkError",
};

export function PlanShareSync() {
  const { session, user } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const { t } = useTranslation();
  const claimedForUser = useRef<string | null>(null);
  const accepting = useRef(false);
  // Read through refs so the effects below only re-run when the signed-in user changes.
  const segmentsRef = useRef<string[]>(segments);
  const tRef = useRef(t);
  useEffect(() => {
    segmentsRef.current = segments;
    tRef.current = t;
  });

  const userId = session ? user?.id ?? null : null;
  const userCreatedAt = user?.created_at ?? null;
  // Only a confirmed email can claim RSVPs; email sign-ups confirm after their first session.
  const emailConfirmed = Boolean(user?.email_confirmed_at);

  // Web RSVPs → participations, once per (confirmed) user per app session.
  useEffect(() => {
    if (!userId || !emailConfirmed || claimedForUser.current === userId) return;
    claimedForUser.current = userId;
    void claimPlanShareRsvps().then((res) => {
      if (res.converted <= 0) return;
      trackShareRsvpConverted({ via: "signup", count: res.converted });
      if (isRecentSignup(userCreatedAt)) trackSignupFromShare({ via: "email" });
    });
  }, [userId, emailConfirmed, userCreatedAt]);

  // Plan links opened in the app.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const handle = async () => {
      if (accepting.current) return;
      const token = await getPendingPlanShareToken();
      if (!token || cancelled) return;
      accepting.current = true;
      try {
        const res = await acceptPlanShare(token);
        if (res.status === "unauthenticated") return; // keep it for after sign-in
        await clearPendingPlanShareToken();
        if (res.convertedRsvp) trackShareRsvpConverted({ via: "app_link", count: 1 });
        if (res.status === "ok" && !res.alreadyJoined && isRecentSignup(userCreatedAt)) {
          trackSignupFromShare({ via: "app_link" });
        }

        const problem = PROBLEM_KEY[res.status];
        if (problem) {
          Alert.alert(tRef.current("planShare.linkProblemTitle"), tRef.current(problem));
          return;
        }
        // Don't pull someone out of sign-up / onboarding — the plan is already in their planner.
        const inSetup = segmentsRef.current.some((s) => s.startsWith("(auth") || s.startsWith("(onboarding"));
        if (cancelled || inSetup || !res.plannerItemId) return;
        if (res.status === "ok" && !res.alreadyJoined) {
          Alert.alert(tRef.current("planShare.joinedTitle"), tRef.current("planShare.joinedBody"));
        }
        router.push(`${Routes.planner}?focus_planner_item_id=${encodeURIComponent(res.plannerItemId)}` as never);
      } finally {
        accepting.current = false;
      }
    };

    void handle();
    const unsubscribe = subscribePendingPlanShareToken((token) => {
      if (token) void handle();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId, userCreatedAt, router]);

  return null;
}

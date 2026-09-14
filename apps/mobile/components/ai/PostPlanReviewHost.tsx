/** Global host for the one-time post-plan review prompt (mounted once in the root layout). */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { PostPlanReviewCard } from "@/components/ai/PostPlanReviewCard";
import { getNextPendingPlanReview, markPlanReviewPrompted, type PendingPlanReview } from "@/lib/ai/planRecommendationFeedback";

export function PostPlanReviewHost() {
  const [review, setReview] = useState<PendingPlanReview | null>(null);
  const shownIdRef = useRef<string | null>(null);

  const check = useCallback(async () => {
    if (shownIdRef.current) return; // one at a time — don't replace a card already on screen
    try {
      const next = await getNextPendingPlanReview();
      if (!next) return;
      shownIdRef.current = next.plannerItemId;
      // Mark as asked immediately so a force-quit/backgrounding right after this point still
      // counts as "asked once" — never nag, even if the user never actually sees the card.
      void markPlanReviewPrompted(next.plannerItemId);
      setReview(next);
    } catch {
      // Silent — this is a nice-to-have prompt, never worth surfacing an error for.
    }
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => sub.remove();
  }, [check]);

  const handleDone = useCallback(() => {
    shownIdRef.current = null;
    setReview(null);
  }, []);

  return <PostPlanReviewCard visible={review != null} review={review} onDone={handleDone} />;
}

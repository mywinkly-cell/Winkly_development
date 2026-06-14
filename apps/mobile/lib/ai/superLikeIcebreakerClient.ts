/**
 * Super Like icebreaker — ai-gateway task `super_like_icebreaker`.
 * Uses allowlisted profile context only; session required.
 */

import { callConcierge } from "@/lib/ai/conciergeClient";
import type {
  RomanceIcebreakerSelf,
  RomanceIcebreakerTarget,
} from "@/lib/matching/romanceIcebreaker";

const ICEBREAKER_TIMEOUT_MS = 4000;

function extractOpenerFromResponse(res: {
  message?: string;
  super_like_icebreaker?: { opener?: string };
  error?: string;
}): string | null {
  if (res.error) return null;
  const nested = res.super_like_icebreaker?.opener;
  if (typeof nested === "string" && nested.trim()) return nested.trim().slice(0, 200);
  const msg = res.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim().slice(0, 200);
  return null;
}

export async function fetchSuperLikeIcebreakerAI(params: {
  partnerUserId: string;
  self: RomanceIcebreakerSelf | null;
  target: RomanceIcebreakerTarget | null;
}): Promise<string | null> {
  const { partnerUserId, self, target } = params;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), ICEBREAKER_TIMEOUT_MS);
  });

  const requestPromise = callConcierge({
    task: "super_like_icebreaker",
    context: {
      mode: "romance",
      partner_user_id: partnerUserId,
      self_profile: {
        interests: self?.interests ?? [],
        city: self?.city ?? undefined,
      },
      other_profile: {
        name: target?.name ?? "",
        interests: target?.chipItems ?? [],
        city: target?.city ?? "",
      },
      origin_context: "Romance_SuperLike",
    },
  }).then((res) => extractOpenerFromResponse(res));

  try {
    return await Promise.race([requestPromise, timeoutPromise]);
  } catch {
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

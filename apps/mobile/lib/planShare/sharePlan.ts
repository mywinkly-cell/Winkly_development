// apps/mobile/lib/planShare/sharePlan.ts
// "Share plan": create (or reuse) the plan's link and open the native share sheet with an
// editable, prefilled message.

import { Share } from "react-native";
import { createPlanShare } from "@/lib/planShare/api";
import {
  buildPlanShareMessage,
  formatPlanShareWhen,
  planShareUrl,
  type PlanShareSource,
} from "@/lib/planShare/links";
import { trackPlanShared } from "@/lib/analytics/events";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type SharePlanResult = "shared" | "dismissed";

export async function sharePlan(p: {
  plannerItemId: string;
  title: string;
  startsAt: string | null | undefined;
  source: PlanShareSource;
  t: Translate;
}): Promise<SharePlanResult> {
  const share = await createPlanShare(p.plannerItemId);
  const url = planShareUrl(share.token);
  const message = buildPlanShareMessage(p.t, { title: p.title, when: formatPlanShareWhen(p.startsAt), url });
  const res = await Share.share({ message });
  if (res.action === Share.dismissedAction) return "dismissed";
  trackPlanShared({ source: p.source });
  return "shared";
}

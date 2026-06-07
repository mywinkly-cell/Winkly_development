import React, { useEffect, useState } from "react";
import { DateSafetyCheckinPromptModal } from "@/components/safety/DateSafetyCheckinPromptModal";
import {
  subscribeDateSafetyPrompt,
  type DateSafetyPromptParams,
} from "@/lib/safety/dateCheckinPrompt";

/** Global host for one-time date safety prompts (mounted once in root layout). */
export function DateSafetyPromptHost() {
  const [params, setParams] = useState<DateSafetyPromptParams | null>(null);

  useEffect(() => subscribeDateSafetyPrompt(setParams), []);

  return (
    <DateSafetyCheckinPromptModal
      visible={params != null}
      params={params}
      onClose={() => setParams(null)}
    />
  );
}

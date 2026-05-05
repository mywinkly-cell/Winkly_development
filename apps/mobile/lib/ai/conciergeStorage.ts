/**
 * Local persistence for Concierge: recent requests and saved ideas.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ConciergeContext } from "./conciergeClient";
import type { ExperienceOption } from "./conciergeClient";
import type { Mode } from "@/types";

const KEY_RECENT = "winkly_concierge_recent_requests";
const KEY_SAVED = "winkly_concierge_saved_ideas";
const KEY_FEEDBACK = "winkly_concierge_feedback";
const MAX_RECENT = 2;
const MAX_SAVED = 50;
const MAX_FEEDBACK = 100;

export type RecentRequest = {
  summary: string;
  context: ConciergeContext;
  timestamp: number;
};

export type SavedIdea = {
  id: string;
  option: ExperienceOption;
  mode: Mode;
  savedAt: string;
  context?: { city?: string; date_from?: string };
};

function makeSummary(ctx: ConciergeContext): string {
  const parts: string[] = [];
  if (ctx.user_prompt?.trim()) parts.push(ctx.user_prompt.trim().slice(0, 40));
  if (ctx.city) parts.push(ctx.city);
  if (ctx.date_from) parts.push(ctx.date_from);
  return parts.length ? parts.join(" · ") : "Recent request";
}

export async function getRecentRequests(): Promise<RecentRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_RECENT);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentRequest[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export async function addRecentRequest(context: ConciergeContext): Promise<void> {
  const summary = makeSummary(context);
  const entry: RecentRequest = { summary, context, timestamp: Date.now() };
  const list = await getRecentRequests();
  const filtered = list.filter((r) => r.summary !== summary && r.context.date_from !== context.date_from);
  const next = [entry, ...filtered].slice(0, MAX_RECENT);
  await AsyncStorage.setItem(KEY_RECENT, JSON.stringify(next));
}

export async function getSavedIdeas(): Promise<SavedIdea[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SAVED);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedIdea[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveIdea(option: ExperienceOption, mode: Mode, context?: { city?: string; date_from?: string }): Promise<SavedIdea> {
  const list = await getSavedIdeas();
  const id = `saved_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const idea: SavedIdea = {
    id,
    option,
    mode,
    savedAt: new Date().toISOString(),
    context,
  };
  const next = [idea, ...list].slice(0, MAX_SAVED);
  await AsyncStorage.setItem(KEY_SAVED, JSON.stringify(next));
  return idea;
}

export async function removeSavedIdea(id: string): Promise<void> {
  const list = await getSavedIdeas();
  const next = list.filter((s) => s.id !== id);
  await AsyncStorage.setItem(KEY_SAVED, JSON.stringify(next));
}

export type ConciergeFeedbackType = "went_well" | "didnt_use" | "not_quite_right";

export type ConciergeFeedbackEntry = {
  optionSummary: string;
  feedback: ConciergeFeedbackType;
  mode: Mode;
  timestamp: number;
};

export async function saveConciergeFeedback(
  optionSummary: string,
  feedback: ConciergeFeedbackType,
  mode: Mode
): Promise<void> {
  const list = await getConciergeFeedbackHistory();
  const entry: ConciergeFeedbackEntry = { optionSummary, feedback, mode, timestamp: Date.now() };
  const next = [entry, ...list].slice(0, MAX_FEEDBACK);
  await AsyncStorage.setItem(KEY_FEEDBACK, JSON.stringify(next));
}

export async function getConciergeFeedbackHistory(): Promise<ConciergeFeedbackEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_FEEDBACK);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ConciergeFeedbackEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


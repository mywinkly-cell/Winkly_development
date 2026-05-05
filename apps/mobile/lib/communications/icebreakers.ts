/** Lightweight icebreaker games — content is sent as structured JSON in chat (message_type: icebreaker). */

export const ICEBREAKER_QUESTIONS = [
  "What’s one thing on your bucket list this year?",
  "Coffee first thing, or tea?",
  "If you could teleport for dinner tonight, where would you go?",
  "What’s a hobby you’d try if time wasn’t an issue?",
  "What’s your favorite way to spend a rainy Sunday?",
] as const;

export function pickRandomIcebreaker(): string {
  const i = Math.floor(Math.random() * ICEBREAKER_QUESTIONS.length);
  return ICEBREAKER_QUESTIONS[i];
}

export function buildIcebreakerPayload(prompt: string, game: "question" = "question") {
  return JSON.stringify({
    type: "icebreaker",
    game,
    prompt,
    created_at: new Date().toISOString(),
  });
}

export function asStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  if (typeof val === "string" && val.trim()) return [val.trim()];
  return [];
}

export function sharedCount(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  return a.filter((x) => setB.has(x)).length;
}

export function relationshipGoalsFromMeta(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const m = meta as Record<string, unknown>;
  return asStringArray(m.relationship_goals ?? m.relationship_goal);
}

export function meetupGoalsFromMeta(meta: unknown): string[] {
  if (!meta || typeof meta !== "object") return [];
  const m = meta as Record<string, unknown>;
  return asStringArray(m.meetup_goals);
}

export type DiscoverProfileItem = {
  id: string;
  name: string;
  age?: number | null;
  photoUrl?: string | null;
};

export type DiscoverSectionKey =
  | "recommended"
  | "same_interests"
  | "same_goals"
  | "nearby";

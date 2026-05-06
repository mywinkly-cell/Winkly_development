import type { Mode } from "@/types";
import type { ActivityCategory } from "@/lib/ai/conciergePlanningFlow";
import { categoriesForInterest } from "@/lib/ai/categoriesForInterest";

export type RankActivityCategoriesInput = {
  selfInterests: string[];
  selfLifestyle: string[];
  partnerInterests?: string[];
  partnerLifestyle?: string[];
  mode: Mode;
};

export type RankedCategory = ActivityCategory & {
  boostReason?: string;
  boosted: boolean;
};

function humanizeInterestCat(tag: string): string {
  return tag.replace(/_/g, " ");
}

function intersectTags(a: string[], b: string[]): string[] {
  const bs = new Set(b);
  return Array.from(new Set(a.filter((x) => bs.has(x))));
}

export function rankActivityCategories(
  categories: ActivityCategory[],
  input: RankActivityCategoriesInput
): RankedCategory[] {
  void input.mode;
  const selfCats = new Set(input.selfInterests.flatMap(categoriesForInterest));
  const partnerCats = input.partnerInterests?.length
    ? new Set(input.partnerInterests.flatMap(categoriesForInterest))
    : null;

  type Scored = RankedCategory & { score: number };

  const scored: Scored[] = categories.map((cat) => {
    const selfMatch = cat.interestTags.some((t) => selfCats.has(t));
    const partnerMatch = partnerCats ? cat.interestTags.some((t) => partnerCats.has(t)) : false;

    let score = 0;
    let boostReason: string | undefined;

    if (selfMatch && partnerMatch && partnerCats) {
      score = 3;
      const sharedCats = intersectTags(cat.interestTags, [...selfCats].filter((t) => partnerCats.has(t))).filter(
        (t) => t !== "other"
      );
      const sharedTag = sharedCats[0] ?? cat.interestTags.find((t) => selfCats.has(t) && partnerCats.has(t));
      boostReason = sharedTag ? `Both love ${humanizeInterestCat(sharedTag)}` : "Shared interest";
    } else if (selfMatch) {
      score = 2;
      const t = cat.interestTags.find((x) => selfCats.has(x) && x !== "other");
      if (t) boostReason = `You love ${humanizeInterestCat(t)}`;
    } else if (partnerMatch && partnerCats) {
      score = 1;
      const t = cat.interestTags.find((x) => partnerCats.has(x) && x !== "other");
      boostReason = t ? `Their ${humanizeInterestCat(t)} side` : "Matches their interests";
    }

    return {
      ...cat,
      boosted: score >= 2,
      boostReason,
      score,
    };
  });

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.label.localeCompare(b.label);
    })
    .map(({ score: _s, ...rest }) => rest);
}

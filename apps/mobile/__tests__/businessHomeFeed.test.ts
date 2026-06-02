import {
  buildViewerContext,
  rankSimilarProfiles,
  scoreBusinessSimilarity,
  type BusinessPersonItem,
} from "@/lib/business/homeFeed";

describe("business home feed", () => {
  const viewer = buildViewerContext({
    city: "Berlin",
    meta: { networking_goals: ["Partnerships"], interests: ["SaaS"] },
    tags: ["Technology"],
  });

  const berlinSaas: BusinessPersonItem = {
    id: "a",
    name: "Alex",
    subtitle: "Founder · Acme",
    meta: "Berlin",
    tags: ["SaaS", "Technology"],
    photoUrl: null,
  };

  const remote: BusinessPersonItem = {
    id: "b",
    name: "Sam",
    subtitle: "Designer",
    meta: "Tokyo",
    tags: ["Design"],
    photoUrl: null,
  };

  it("scores higher for overlapping city and tags", () => {
    expect(scoreBusinessSimilarity(viewer, berlinSaas)).toBeGreaterThan(
      scoreBusinessSimilarity(viewer, remote)
    );
  });

  it("ranks similar profiles first", () => {
    const ranked = rankSimilarProfiles(viewer, [remote, berlinSaas], 2);
    expect(ranked[0]?.id).toBe("a");
  });
});

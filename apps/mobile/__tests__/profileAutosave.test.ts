import {
  applyPatch,
  buildProfileDraft,
  diffProfileDraft,
  emptyDraft,
  isPatchEmpty,
  modeHasOwnContent,
  parseDateOnly,
  retryDelayMs,
  seedSavedDraft,
  toISODateOnly,
  valuesEqual,
  type ProfileDraft,
  type ProfileDraftInput,
} from "@/lib/profile/profileAutosave";

const baseInput: ProfileDraftInput = {
  firstName: "Anna",
  lastName: "Kowalski",
  gender: "Female",
  birthday: new Date(1990, 4, 15),
  city: "Berlin, Germany",
  education: "",
  occupation: "",
  languages: [],
  instagram: "",
  interests: [],
  showFullName: false,
  romanceEnabled: false,
  friendsEnabled: false,
  businessEnabled: false,
  bioRomance: "",
  heightRomance: "",
  weightRomance: "",
  lifestyleRomance: "",
  smokingRomance: "",
  alcoholRomance: "",
  kidsRomance: "",
  sexualViewsRomance: "",
  relationshipGoalsRomance: [],
  religionRomance: "",
  politicalViewsRomance: "",
  valuesRomance: [],
  petsRomance: [],
  foodRomance: "",
  bioFriends: "",
  lifestyleFriends: "",
  alcoholFriends: "",
  smokingFriends: "",
  meetupGoalsFriends: [],
  statusFriends: "",
  kidsFriends: "",
  petsFriends: [],
  foodFriends: "",
  bioBusiness: "",
  roleBusiness: "",
  companyBusiness: "",
  areaBusiness: "",
  networkingGoalsBusiness: [],
  skillsBusiness: [],
  interestsBusiness: [],
  instagramBusiness: "",
};

const draftOf = (over: Partial<ProfileDraftInput> = {}): ProfileDraft => buildProfileDraft({ ...baseInput, ...over });

describe("buildProfileDraft", () => {
  it("maps fields to their columns and blanks to null", () => {
    const { profile } = draftOf({ occupation: "Nurse", instagram: "  @anna  ", languages: ["English"] });
    expect(profile).toMatchObject({
      first_name: "Anna",
      last_name: "Kowalski",
      gender: "Female",
      birthday: "1990-05-15",
      city: "Berlin, Germany",
      education: null,
      occupation: "Nurse",
      instagram: "@anna",
      languages: ["English"],
      interests: null,
      show_full_name: false,
    });
  });

  it("leaves an empty first/last name undefined (NOT NULL columns must never be blanked mid-edit)", () => {
    const { profile } = draftOf({ firstName: "  ", lastName: "" });
    expect(profile.first_name).toBeUndefined();
    expect(profile.last_name).toBeUndefined();
  });

  it("only includes modes that are enabled", () => {
    const draft = draftOf({ romanceEnabled: true, businessEnabled: true });
    expect(Object.keys(draft.modes).sort()).toEqual(["business", "romance"]);
  });

  it("shares general interests with Romance/Friends and keeps Business interests separate", () => {
    const draft = draftOf({
      romanceEnabled: true,
      friendsEnabled: true,
      businessEnabled: true,
      interests: ["Hiking"],
      interestsBusiness: ["SaaS"],
    });
    expect(draft.profile.interests).toEqual(["Hiking"]);
    expect(draft.modes.romance?.interests).toEqual(["Hiking"]);
    expect(draft.modes.friends?.interests).toEqual(["Hiking"]);
    expect(draft.modes.business?.interests).toEqual(["SaaS"]);
  });

  it("never contains photo or video columns", () => {
    const draft = draftOf({ romanceEnabled: true, friendsEnabled: true, businessEnabled: true });
    const keys = [
      ...Object.keys(draft.profile),
      ...Object.values(draft.modes).flatMap((m) => [...Object.keys(m ?? {}), ...Object.keys((m?.meta as object) ?? {})]),
    ];
    expect(keys.filter((k) => /photo|video/i.test(k))).toEqual([]);
  });
});

describe("diffProfileDraft", () => {
  const saved = draftOf({ romanceEnabled: true, bioRomance: "Hi", interests: ["Hiking"] });

  it("is empty when nothing changed", () => {
    expect(isPatchEmpty(diffProfileDraft(saved, draftOf({ romanceEnabled: true, bioRomance: "Hi", interests: ["Hiking"] })))).toBe(true);
  });

  it("sends only the changed profile column", () => {
    const next = draftOf({ romanceEnabled: true, bioRomance: "Hi", interests: ["Hiking"], occupation: "Nurse" });
    expect(diffProfileDraft(saved, next)).toEqual({ profile: { occupation: "Nurse" }, modes: {} });
  });

  it("sends only the changed mode column, and the whole meta object when one meta key changes", () => {
    const next = draftOf({ romanceEnabled: true, bioRomance: "Hi", interests: ["Hiking"], heightRomance: "170" });
    const patch = diffProfileDraft(saved, next);
    expect(patch.profile).toEqual({});
    expect(Object.keys(patch.modes.romance ?? {})).toEqual(["meta"]);
    expect(patch.modes.romance?.meta).toMatchObject({ height: "170", lifestyle: null });
  });

  it("treats a changed list order as a change and an identical list as none", () => {
    const a = draftOf({ interests: ["A", "B"] });
    expect(isPatchEmpty(diffProfileDraft(a, draftOf({ interests: ["A", "B"] })))).toBe(true);
    expect(diffProfileDraft(a, draftOf({ interests: ["B", "A"] })).profile).toEqual({ interests: ["B", "A"] });
  });

  it("writes null when the user clears a field", () => {
    const withOcc = draftOf({ occupation: "Nurse" });
    expect(diffProfileDraft(withOcc, draftOf({ occupation: "" })).profile).toEqual({ occupation: null });
  });

  it("does not send an emptied first name (undefined = skipped, stays as saved)", () => {
    expect(isPatchEmpty(diffProfileDraft(draftOf(), draftOf({ firstName: "" })))).toBe(true);
  });

  it("propagates a shared-interest change to enabled mode rows that already exist", () => {
    const patch = diffProfileDraft(saved, draftOf({ romanceEnabled: true, bioRomance: "Hi", interests: ["Hiking", "Yoga"] }));
    expect(patch.profile).toEqual({ interests: ["Hiking", "Yoga"] });
    expect(patch.modes.romance).toEqual({ interests: ["Hiking", "Yoga"] });
  });

  it("detects a birthday change", () => {
    expect(diffProfileDraft(draftOf(), draftOf({ birthday: new Date(1991, 0, 2) })).profile).toEqual({ birthday: "1991-01-02" });
  });

  describe("row creation gates", () => {
    it("does not write the profile until BOTH names exist when no row is saved yet", () => {
      expect(diffProfileDraft(emptyDraft(), draftOf({ lastName: "" })).profile).toEqual({});
    });

    it("creates the profile with every non-empty column once both names exist", () => {
      const patch = diffProfileDraft(emptyDraft(), draftOf({ occupation: "Nurse" }));
      expect(patch.profile).toMatchObject({ first_name: "Anna", last_name: "Kowalski", occupation: "Nurse", birthday: "1990-05-15" });
      expect(patch.profile.education).toBeUndefined(); // null vs missing = nothing to send
    });

    it("does not create a mode row from defaults or shared interests alone", () => {
      const draft = draftOf({ romanceEnabled: true, friendsEnabled: true, interests: ["Hiking"] });
      expect(diffProfileDraft(emptyDraft(), draft).modes).toEqual({});
    });

    it("creates a mode row (all columns) once the user has entered something in it", () => {
      const draft = draftOf({ romanceEnabled: true, bioRomance: "Hello", interests: ["Hiking"] });
      const patch = diffProfileDraft(emptyDraft(), draft);
      expect(Object.keys(patch.modes.romance ?? {}).sort()).toEqual(["bio", "interests", "meta"]);
    });

    it("stops syncing a mode once the user disables it (no delete, no write)", () => {
      const off = draftOf({ romanceEnabled: false });
      expect(diffProfileDraft(saved, off).modes).toEqual({});
    });
  });
});

describe("modeHasOwnContent", () => {
  it("ignores shared interests and null/empty meta", () => {
    const empty = draftOf({ romanceEnabled: true, interests: ["Hiking"] }).modes.romance!;
    expect(modeHasOwnContent(empty)).toBe(false);
  });
  it("counts a bio, a meta string or a meta list", () => {
    expect(modeHasOwnContent(draftOf({ romanceEnabled: true, bioRomance: "x" }).modes.romance!)).toBe(true);
    expect(modeHasOwnContent(draftOf({ romanceEnabled: true, foodRomance: "Vegan" }).modes.romance!)).toBe(true);
    expect(modeHasOwnContent(draftOf({ friendsEnabled: true, meetupGoalsFriends: ["Coffee"] }).modes.friends!)).toBe(true);
  });
});

describe("applyPatch / seedSavedDraft", () => {
  it("after applying a patch the diff is empty (round trip)", () => {
    const start = draftOf({ romanceEnabled: true, bioRomance: "Hi" });
    const next = draftOf({ romanceEnabled: true, bioRomance: "Hello", occupation: "Nurse", heightRomance: "170", friendsEnabled: true, bioFriends: "Yo" });
    const patch = diffProfileDraft(start, next);
    expect(isPatchEmpty(diffProfileDraft(applyPatch(start, patch), next))).toBe(true);
  });

  it("a partially persisted patch leaves only the remainder dirty", () => {
    const start = emptyDraft();
    const next = draftOf({ romanceEnabled: true, bioRomance: "Hi" });
    const patch = diffProfileDraft(start, next);
    const afterPartial = applyPatch(start, { profile: patch.profile, modes: {} }); // profile written, romance failed
    const remainder = diffProfileDraft(afterPartial, next);
    expect(remainder.profile).toEqual({});
    expect(Object.keys(remainder.modes)).toEqual(["romance"]);
  });

  it("seeds saved = hydrated for existing rows and nothing for missing rows", () => {
    const hydrated = draftOf({ romanceEnabled: true, bioRomance: "Hi", friendsEnabled: true, bioFriends: "Yo" });
    const seeded = seedSavedDraft(hydrated, { profileRow: true, modeRows: ["romance"] });
    expect(seeded.profile).toEqual(hydrated.profile);
    expect(Object.keys(seeded.modes)).toEqual(["romance"]);
    // Nothing to write for what exists; the unsaved Friends row still gets created.
    const patch = diffProfileDraft(seeded, hydrated);
    expect(patch.profile).toEqual({});
    expect(Object.keys(patch.modes)).toEqual(["friends"]);
  });

  it("seeds an empty profile when no row exists, so a restored local draft is pushed", () => {
    const hydrated = draftOf();
    const seeded = seedSavedDraft(hydrated, { profileRow: false, modeRows: [] });
    expect(diffProfileDraft(seeded, hydrated).profile).toMatchObject({ first_name: "Anna", last_name: "Kowalski" });
  });
});

describe("valuesEqual", () => {
  it("treats undefined and null alike and compares deeply", () => {
    expect(valuesEqual(undefined, null)).toBe(true);
    expect(valuesEqual({ a: 1, b: null }, { a: 1 })).toBe(true);
    expect(valuesEqual({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
    expect(valuesEqual([], null)).toBe(false);
    expect(valuesEqual(false, null)).toBe(false);
  });
});

describe("date-only helpers", () => {
  it("parses yyyy-mm-dd as a LOCAL date and round-trips it (no off-by-one west of UTC)", () => {
    const d = parseDateOnly("1990-05-15")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([1990, 4, 15]);
    expect(toISODateOnly(d)).toBe("1990-05-15");
  });

  it("returns null for empty or unparseable input", () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly("")).toBeNull();
    expect(parseDateOnly("not a date")).toBeNull();
  });
});

describe("retryDelayMs", () => {
  it("backs off exponentially and caps at 30s", () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(retryDelayMs)).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });
  it("clamps nonsense attempts to the first delay", () => {
    expect(retryDelayMs(0)).toBe(2000);
    expect(retryDelayMs(-3)).toBe(2000);
  });
});

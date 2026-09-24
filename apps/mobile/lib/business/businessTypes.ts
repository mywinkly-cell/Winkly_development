import type { BusinessProfileType } from "@/types";

export type BusinessTypeStep = "type" | "org_subtype" | "profile";

// labelKey / hintKey are i18n keys (onboarding flow). label / hint stay as the English
// source for screens that haven't moved to i18n yet (app/profile/edit-business.tsx).
export const BUSINESS_TYPE_PRIMARY_OPTIONS: Array<{
  key: "professional" | "organisation";
  label: string;
  hint: string;
  labelKey: string;
  hintKey: string;
}> = [
  {
    key: "professional",
    label: "I am a professional",
    hint: "Consultant, freelancer, founder",
    labelKey: "onboarding.businessProfile.type.professional",
    hintKey: "onboarding.businessProfile.type.professionalHint",
  },
  {
    key: "organisation",
    label: "We are a venue or organisation",
    hint: "Restaurant, studio, brand, event host",
    labelKey: "onboarding.businessProfile.type.organisation",
    hintKey: "onboarding.businessProfile.type.organisationHint",
  },
];

export const BUSINESS_ORG_SUBTYPE_OPTIONS: Array<{
  value: BusinessProfileType;
  label: string;
  hint: string;
  labelKey: string;
  hintKey: string;
}> = [
  {
    value: "venue",
    label: "Venue",
    hint: "Restaurant, bar, studio, coworking",
    labelKey: "onboarding.businessProfile.subtype.venue",
    hintKey: "onboarding.businessProfile.subtype.venueHint",
  },
  {
    value: "event_host",
    label: "Event host",
    hint: "Organiser, promoter, experience provider",
    labelKey: "onboarding.businessProfile.subtype.eventHost",
    hintKey: "onboarding.businessProfile.subtype.eventHostHint",
  },
  {
    value: "brand",
    label: "Brand / company",
    hint: "Company or organisation account",
    labelKey: "onboarding.businessProfile.subtype.brand",
    hintKey: "onboarding.businessProfile.subtype.brandHint",
  },
];

export function businessTypeLabel(type: BusinessProfileType | string | null | undefined): string {
  switch (type) {
    case "individual_professional":
      return "Individual professional";
    case "venue":
      return "Venue";
    case "event_host":
      return "Event host";
    case "brand":
      return "Brand / company";
    case "professional":
      return "Individual professional";
    default:
      return "Business";
  }
}

/** Map legacy DB value if present. */
export function normalizeBusinessType(raw: string | null | undefined): BusinessProfileType {
  if (raw === "professional") return "individual_professional";
  if (raw === "venue" || raw === "event_host" || raw === "brand" || raw === "individual_professional") {
    return raw;
  }
  return "brand";
}

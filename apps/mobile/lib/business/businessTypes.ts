import type { BusinessProfileType } from "@/types";

export type BusinessTypeStep = "type" | "org_subtype" | "profile";

export const BUSINESS_TYPE_PRIMARY_OPTIONS: Array<{
  key: "professional" | "organisation";
  label: string;
  hint: string;
}> = [
  { key: "professional", label: "I am a professional", hint: "Consultant, freelancer, founder" },
  { key: "organisation", label: "We are a venue or organisation", hint: "Restaurant, studio, brand, event host" },
];

export const BUSINESS_ORG_SUBTYPE_OPTIONS: Array<{
  value: BusinessProfileType;
  label: string;
  hint: string;
}> = [
  { value: "venue", label: "Venue", hint: "Restaurant, bar, studio, coworking" },
  { value: "event_host", label: "Event host", hint: "Organiser, promoter, experience provider" },
  { value: "brand", label: "Brand / company", hint: "Company or organisation account" },
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

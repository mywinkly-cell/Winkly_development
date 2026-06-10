import {
  formatBusinessOfferSummaryLine,
  getBusinessOfferDisplayStatus,
  isBusinessOfferDashboardVisible,
  type BusinessOfferRow,
} from "@/lib/business/offersStore";

const BASE_OFFER: BusinessOfferRow = {
  id: "offer-1",
  business_id: "biz-1",
  title: "2-for-1 cocktails",
  description: null,
  image_url: null,
  booking_url: null,
  category_tags: ["drinks_bar"],
  valid_from: null,
  valid_to: "2026-06-30T23:59:59.000Z",
  radius_km: 5,
  budget_cents: 0,
  is_active: true,
  city: "Berlin",
  created_at: "2026-06-01T00:00:00.000Z",
};

describe("getBusinessOfferDisplayStatus", () => {
  const now = new Date("2026-06-15T12:00:00.000Z").getTime();

  it("returns inactive when offer is not active", () => {
    expect(getBusinessOfferDisplayStatus({ ...BASE_OFFER, is_active: false }, now)).toBe("inactive");
  });

  it("returns scheduled when valid_from is in the future", () => {
    expect(
      getBusinessOfferDisplayStatus(
        { ...BASE_OFFER, valid_from: "2026-06-20T00:00:00.000Z", valid_to: "2026-07-01T00:00:00.000Z" },
        now
      )
    ).toBe("scheduled");
  });

  it("returns expired when valid_to is in the past", () => {
    expect(
      getBusinessOfferDisplayStatus({ ...BASE_OFFER, valid_to: "2026-06-01T00:00:00.000Z" }, now)
    ).toBe("expired");
  });

  it("returns active when within the valid window", () => {
    expect(getBusinessOfferDisplayStatus(BASE_OFFER, now)).toBe("active");
  });
});

describe("isBusinessOfferDashboardVisible", () => {
  it("includes active and scheduled offers", () => {
    expect(isBusinessOfferDashboardVisible(BASE_OFFER)).toBe(true);
    expect(
      isBusinessOfferDashboardVisible({
        ...BASE_OFFER,
        valid_from: "2026-06-20T00:00:00.000Z",
        valid_to: "2026-07-01T00:00:00.000Z",
      })
    ).toBe(true);
  });

  it("excludes expired and inactive offers", () => {
    expect(
      isBusinessOfferDashboardVisible({
        ...BASE_OFFER,
        valid_to: "2026-06-01T00:00:00.000Z",
      })
    ).toBe(false);
    expect(isBusinessOfferDashboardVisible({ ...BASE_OFFER, is_active: false })).toBe(false);
  });
});

describe("formatBusinessOfferSummaryLine", () => {
  const now = new Date("2026-06-15T12:00:00.000Z").getTime();

  it("formats active offer with category, radius, and end date", () => {
    const line = formatBusinessOfferSummaryLine(BASE_OFFER, now);
    expect(line).toContain("5 km radius");
    expect(line).toMatch(/ends Jun 30/);
    expect(line).toContain(" · ");
  });

  it("uses starts date for scheduled offers", () => {
    const line = formatBusinessOfferSummaryLine(
      {
        ...BASE_OFFER,
        valid_from: "2026-06-20T00:00:00.000Z",
        valid_to: "2026-07-01T00:00:00.000Z",
      },
      now
    );
    expect(line).toMatch(/starts Jun 20/);
    expect(line).not.toMatch(/ends/);
  });
});

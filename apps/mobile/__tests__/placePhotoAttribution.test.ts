// Google photo attributions are HTML; we keep only plain text (shown under venue photos).

import { plainAttribution } from "../../../supabase/functions/_shared/placeAttribution";

const attr = (html: string) => plainAttribution([html]);

describe("photo attribution", () => {
  it("keeps the author name from Google's link", () => {
    expect(attr('<a href="https://maps.google.com/maps/contrib/1">Anna M.</a>')).toBe("Anna M.");
  });

  it("leaves no markup behind, even from nested tags", () => {
    expect(attr("<<a>script>alert(1)<</a>/script>")).not.toMatch(/[<>]/);
  });
});

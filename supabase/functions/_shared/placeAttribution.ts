// Google Place photo attributions arrive as HTML (`html_attributions`, usually one <a> link
// to the author). We only ever show the author's name, as plain text.
// Import-free so it can be tested from the mobile Jest suite.

/** First attribution as plain text (max 120 chars), or null. */
export function plainAttribution(html: unknown): string | null {
  if (!Array.isArray(html) || typeof html[0] !== "string") return null;
  // Remove tags, then any stray angle brackets, so nested input like "<<a>script>" can't
  // leave markup behind.
  const text = html[0].replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim();
  return text ? text.slice(0, 120) : null;
}

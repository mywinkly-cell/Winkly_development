// Google Place photo attributions arrive as HTML (`html_attributions`, usually one <a> link
// to the author). We only ever show the author's name, as plain text.
// Import-free so it can be tested from the mobile Jest suite.

/**
 * Text outside of tags, in one pass: everything from "<" to the next ">" is dropped and the
 * brackets themselves are never kept, so nested input like "<<a>script>" can't leave
 * markup behind.
 */
function textOutsideTags(html: string): string {
  let out = "";
  let inTag = false;
  for (const ch of html) {
    if (ch === "<") inTag = true;
    else if (ch === ">") inTag = false;
    else if (!inTag) out += ch;
  }
  return out;
}

/** First attribution as plain text (max 120 chars), or null. */
export function plainAttribution(html: unknown): string | null {
  if (!Array.isArray(html) || typeof html[0] !== "string") return null;
  const text = textOutsideTags(html[0]).trim();
  return text ? text.slice(0, 120) : null;
}

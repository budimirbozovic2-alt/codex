/**
 * Highlights key parts in HTML content by wrapping matched text
 * with a <mark> tag using the accent system color.
 */
export function highlightKeyParts(html: string, keyParts?: string[]): string {
  if (!keyParts || keyParts.length === 0) return html;

  let result = html;
  for (const part of keyParts) {
    if (!part || part.length < 3) continue;
    // Escape special regex chars
    const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match across whitespace variations but not inside HTML tags
    const pattern = new RegExp(
      `(?![^<]*>)(${escaped.replace(/\s+/g, "\\s+")})`,
      "gi"
    );
    result = result.replace(
      pattern,
      '<mark class="key-part-highlight">$1</mark>'
    );
  }
  return result;
}

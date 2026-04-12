import { sanitizeHtml } from "@/lib/sanitize";
import React, { useMemo } from "react";

/**
 * Highlights key parts in HTML content by wrapping matched text
 * with a <mark> tag using the accent system color.
 * Output is always sanitized for defense-in-depth XSS protection.
 */
export function highlightKeyParts(html: string, keyParts?: string[]): string {
  if (!keyParts || keyParts.length === 0) return sanitizeHtml(html);

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
  return sanitizeHtml(result);
}

/**
 * Memoized highlighted section component for use inside .map() loops.
 */
export function HighlightedSection({ content, keyParts, className }: { content: string; keyParts?: string[]; className?: string }) {
  const html = useMemo(() => highlightKeyParts(content, keyParts), [content, keyParts]);
  return React.createElement("div", { className, dangerouslySetInnerHTML: { __html: html } });
}

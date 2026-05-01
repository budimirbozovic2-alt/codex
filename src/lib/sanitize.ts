import DOMPurify from "dompurify";

// Regex helpers used by the non-DOM stripHtml variants.
const TAG_RE = /<[^>]*>/g;
const WS_RE = /\s+/g;
const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};
function decodeEntities(s: string): string {
  return s.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, m => ENTITY_MAP[m] ?? m);
}

/**
 * Sanitize HTML to prevent XSS attacks.
 * Allows safe formatting tags but strips scripts, event handlers, etc.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "p", "br", "b", "i", "u", "em", "strong", "s", "sub", "sup",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "pre", "code",
      "a", "span", "div", "table", "thead", "tbody", "tr", "th", "td",
      "mark", "hr", "img",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "class", "style", "src", "alt", "width", "height",
      "colspan", "rowspan", "id",
    ],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * DOM-based HTML to plain-text. Safer than regex (handles entities, nested
 * tags, malformed input) but requires `document` — do not call from workers
 * or pure-Node contexts. For those, use `stripHtmlText`.
 */
export function stripHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  if (typeof document === "undefined") return decodeEntities(sanitized).replace(WS_RE, " ").trim();
  const div = document.createElement("div");
  div.innerHTML = sanitized;
  return (div.textContent || div.innerText || "").trim();
}

/**
 * Regex-based HTML to plain-text. Use in workers or hot paths where DOM
 * access is unavailable / undesirable. Decodes the common HTML entities
 * (&nbsp; &amp; &lt; &gt; &quot; &#39;) and collapses whitespace.
 */
export function stripHtmlText(html: string): string {
  return decodeEntities(html.replace(TAG_RE, " ")).replace(WS_RE, " ").trim();
}

/**
 * Escape user-provided text for safe interpolation into HTML strings
 * (e.g., highlighting, server-side templating). Use this whenever you
 * concatenate untrusted input into innerHTML rather than text nodes.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

import DOMPurify from "dompurify";

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
      "colspan", "rowspan",
    ],
    ALLOW_DATA_ATTR: false,
  });
}

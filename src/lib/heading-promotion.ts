/**
 * Heading Promotion Engine
 *
 * Detects legal/structural section patterns (GLAVA, DIO, POGLAVLJE, etc.)
 * and promotes them to proper HTML heading tags for outline navigation.
 * Bold/CAPS paragraphs are NOT promoted — only explicit structural patterns.
 */

// ─── Legal / structural heading patterns ────────────────
const LEGAL_SECTION_H1 = /^(DIO|PART)\s+[IVXLCDM\d]+\.?\s*$/i;
const LEGAL_SECTION_H2 = /^(GLAVA|POGLAVLJE|CHAPTER|NASLOV|TITLE)\s+[IVXLCDM\d]+\.?(\s*[-–—:]\s*.+)?$/i;
const LEGAL_SECTION_H3 = /^(ODJELJAK|ODSJEK|SECTION|PODODJELJAK)\s+[A-Z\d]+\.?(\s*[-–—:]\s*.+)?$/i;

/** Classify a paragraph as a legal structural heading, or null */
function classifyLegalHeading(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 3) return null;
  if (LEGAL_SECTION_H1.test(trimmed)) return 1;
  if (LEGAL_SECTION_H2.test(trimmed)) return 2;
  if (LEGAL_SECTION_H3.test(trimmed)) return 3;
  return null;
}

/**
 * Promote only legal/structural pseudo-headings to real heading tags.
 * Returns modified HTML with matches replaced by <h1>-<h3> tags.
 */
export function promoteHeadings(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const paragraphs = doc.querySelectorAll("p");

  let promotedCount = 0;

  paragraphs.forEach(p => {
    if (p.closest("h1, h2, h3, h4, h5, h6, table, li")) return;
    if (p.querySelector("img, table")) return;

    const text = p.textContent?.trim() || "";
    if (!text || text.length < 3) return;

    const level = classifyLegalHeading(text);
    if (!level) return;

    const heading = doc.createElement(`h${level}`);
    heading.textContent = text;
    p.replaceWith(heading);
    promotedCount++;
  });

  return promotedCount > 0 ? doc.body.innerHTML : html;
}

// ─── Private helpers for detectTitle only ───────────────

function isMostlyUpperCase(text: string): boolean {
  const alpha = text.replace(/[^a-zA-ZčćžšđČĆŽŠĐ]/g, "");
  if (alpha.length < 2) return false;
  const upper = alpha.replace(/[^A-ZČĆŽŠĐ]/g, "");
  return upper.length / alpha.length >= 0.7;
}

function isPureBold(el: Element): boolean {
  const text = el.textContent?.trim() || "";
  if (!text || text.length > 200) return false;
  if (text.endsWith(".") && text.split(".").length > 2) return false;

  const clone = el.cloneNode(true) as Element;
  const strongs = clone.querySelectorAll("strong, b");
  if (strongs.length === 0) return false;

  let boldText = "";
  strongs.forEach(s => { boldText += s.textContent || ""; });
  return boldText.trim().length / text.length >= 0.85;
}

/**
 * Auto-detect source title from the first heading or prominent text.
 */
export function detectTitle(html: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const h1 = doc.querySelector("h1");
  if (h1?.textContent?.trim()) return h1.textContent.trim();

  const elements = Array.from(doc.body.children).slice(0, 5);
  for (const el of elements) {
    const text = el.textContent?.trim() || "";
    if (!text || text.length < 3 || text.length > 150) continue;
    if (isPureBold(el) || isMostlyUpperCase(text)) {
      if (/služben|glasnik|list|novin|objavljen|br\./i.test(text)) continue;
      if (/^\d+\/\d+/.test(text)) continue;
      return text;
    }
  }

  const fullText = doc.body.textContent || "";
  const lawMatch = fullText.match(/^[\s\S]{0,500}?(ZAKON\s+O\s+[^\n.]+)/i);
  if (lawMatch) return lawMatch[1].trim();
  const pravilnikMatch = fullText.match(/^[\s\S]{0,500}?(PRAVILNIK\s+O\s+[^\n.]+)/i);
  if (pravilnikMatch) return pravilnikMatch[1].trim();
  const uredbaMatch = fullText.match(/^[\s\S]{0,500}?(UREDBA\s+O\s+[^\n.]+)/i);
  if (uredbaMatch) return uredbaMatch[1].trim();

  return null;
}

// Pure helpers for analyzing card content: number extraction and
// enumeration detection. No I/O, no React.

export function extractNumbers(html: string): { number: number; context: string }[] {
  const text = html.replace(/<[^>]*>/g, "");
  const matches: { number: number; context: string }[] = [];
  const regex = /\b(\d+)\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    if (num >= 0 && num <= 9999) {
      const start = Math.max(0, match.index - 20);
      const end = Math.min(text.length, match.index + match[0].length + 20);
      const context = text.slice(start, end).trim();
      if (!matches.some(m => m.number === num && m.context === context)) {
        matches.push({ number: num, context });
      }
    }
  }
  return matches;
}

export function detectEnumerationItems(html: string): string[] {
  const liMatches = html.match(/<li[^>]*>(.*?)<\/li>/gi);
  if (liMatches && liMatches.length >= 2) {
    return liMatches.map(li => li.replace(/<[^>]*>/g, "").trim()).filter(Boolean);
  }
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const numbered = text.match(/\d+[.)]\s*[^,;\d]+/g);
  if (numbered && numbered.length >= 2) {
    return numbered.map(s => s.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean);
  }
  const semicoloned = text.split(/;\s*/);
  if (semicoloned.length >= 3) {
    return semicoloned.map(s => s.trim()).filter(s => s.length > 1);
  }
  const commaItems = text.split(/,\s*/);
  if (commaItems.length >= 3 && commaItems.every(s => s.length < 60)) {
    return commaItems.map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Mass-import parser for single-sided flashcards using P:/O: prefixes.
 *
 *   P: Pitanje (Question)
 *   O: Odgovor (Answer)
 *
 * Rules:
 *   1. Prefixes (`P:` / `O:`, case-insensitive) are stripped from the output.
 *   2. Answer bodies span multiple lines/paragraphs — everything between
 *      an `O:` marker and the next `P:` marker (or EOF) belongs to that answer.
 *   3. Both fields are .trim()-ed.
 *   4. Blocks missing either side are silently skipped.
 *
 * Side-effect free → trivially unit-testable and reusable in the upcoming Wizard.
 */
export interface ParsedFlashcard {
  question: string;
  answer: string;
}

/** Matches a P:/p: or O:/o: marker that starts its own (optionally indented) line. */
const MARKER_RE = /^[ \t]*([PpOo])[ \t]*:[ \t]?(.*)$/;

/**
 * Normalize raw input so different copy-paste sources (Word, PDF, Google Docs,
 * chat apps) yield identical parsing behavior.
 *
 * Steps:
 *   - Strip UTF-8 BOM and zero-width characters.
 *   - Convert non-breaking / ideographic spaces to regular spaces.
 *   - Normalize CRLF / CR → LF.
 *   - Convert tabs to single spaces.
 *   - Trim trailing whitespace on every line.
 *   - Collapse 3+ consecutive blank lines into exactly one blank line.
 *   - Trim leading/trailing blank lines around the whole input.
 */
function normalizeFlashcardInput(input: string): string {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/^\uFEFF/, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

export function parseFlashcards(input: string): ParsedFlashcard[] {
  if (!input || typeof input !== "string") return [];

  const lines = normalizeFlashcardInput(input).split("\n");
  const out: ParsedFlashcard[] = [];

  let curQ: string[] | null = null;
  let curA: string[] | null = null;
  let mode: "q" | "a" | null = null;

  const flush = () => {
    if (curQ && curA) {
      const q = curQ.join("\n").trim();
      const a = curA.join("\n").trim();
      if (q && a) out.push({ question: q, answer: a });
    }
    curQ = null;
    curA = null;
    mode = null;
  };

  for (const rawLine of lines) {
    const m = MARKER_RE.exec(rawLine);
    if (m) {
      const kind = m[1].toLowerCase() as "p" | "o";
      const rest = m[2];
      if (kind === "p") {
        // New question → flush any previous complete pair.
        flush();
        curQ = [rest];
        mode = "q";
      } else {
        // `O:` only meaningful when a question is in flight.
        if (curQ === null) continue;
        curA = [rest];
        mode = "a";
      }
      continue;
    }

    // Continuation line — append verbatim so multi-paragraph answers preserve
    // their internal blank lines.
    if (mode === "a" && curA) curA.push(rawLine);
    else if (mode === "q" && curQ) curQ.push(rawLine);
    // else: text outside any P:/O: block — ignored.
  }

  flush();
  return out;
}

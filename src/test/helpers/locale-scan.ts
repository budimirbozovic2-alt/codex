/**
 * TD-4 — Shared locale scan helpers for core UX flow files.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");

export const CORE_LOCALE_FILES = [
  "../components/Dashboard.tsx",
  "../components/ReviewSession.tsx",
  "../components/LearnSession.tsx",
  "../views/CategoryView.tsx",
  "../components/source-reader/SourceContent.tsx",
  "../components/SessionChrome.tsx",
  "../components/ui/PageHeader.tsx",
] as const;

const ENGLISH_SUGGESTIONS: Record<string, string> = {
  "Loading...": "Učitavanje…",
  "Please try again": "Pokušajte ponovo",
  "Try again": "Pokušajte ponovo",
  "Try again later": "Pokušajte ponovo kasnije",
  "Something went wrong": "Nešto nije u redu",
  "Discard changes": "Odbaci izmjene",
  "Not found": "Nije pronađeno",
  "No results": "Nema rezultata",
  "Click here": "Kliknite ovdje",
  "Go back": "Nazad",
  "Show more": "Prikaži više",
  "Are you sure": "Jeste li sigurni",
  "Failed to": "Nije uspjelo",
  "Unable to": "Nije moguće",
  "Success!": "Uspjeh!",
  "Error:": "Greška:",
  "Warning:": "Upozorenje:",
  "Save changes": "Sačuvaj izmjene",
  "Unsaved changes": "Nesačuvane izmjene",
  "Export data": "Izvezi podatke",
  "Import data": "Uvezi podatke",
  "Welcome to": "Dobrodošli u",
  "Get started": "Započnite",
  "Learn more": "Saznajte više",
  "Read more": "Pročitajte više",
  "Sign in": "Prijava",
  "Sign out": "Odjava",
  "Log out": "Odjava",
  Settings: "Postavke",
  Dashboard: "Početna",
  Continue: "Nastavi",
  Restore: "Vrati",
  Dismiss: "Odbaci",
  Submit: "Pošalji",
  Cancel: "Otkaži",
  Delete: "Obriši",
  "Search sources": "Pretraži izvore",
  "Back to home": "Nazad na početnu",
};

const ENGLISH_UI_PATTERN = new RegExp(
  `\\b(${Object.keys(ENGLISH_SUGGESTIONS).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
);

function loadAllowlist(): RegExp[] {
  const raw = readFileSync(resolve(FIXTURES_DIR, "locale-allowlist.txt"), "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => new RegExp(line));
}

const ALLOWLIST = loadAllowlist();

export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function isAllowlisted(line: string, match: string): boolean {
  return ALLOWLIST.some((re) => re.test(line) || re.test(match));
}

function extractStringLiterals(line: string): string[] {
  const literals: string[] = [];
  for (const match of line.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    literals.push(match[2]!);
  }
  return literals;
}

export function isUserFacingLine(line: string): boolean {
  if (/^\s*import\s/.test(line)) return false;
  if (/className=/.test(line)) return false;
  if (/className:\s*/.test(line)) return false;
  if (/style=\{\{/.test(line)) return false;
  if (/cn\(/.test(line)) return false;
  if (/from\s+["']/.test(line)) return false;
  if (/^\s*\/\//.test(line)) return false;
  return (
    /toast\.(error|success|info|warning)\(/.test(line) ||
    /(title|placeholder|aria-label|description|retryLabel|backLabel)=/.test(line) ||
    />\s*["'`][^"'`]+["'`]\s*</.test(line) ||
    /(label|subtitle|eyebrow)=\{?["'`]/.test(line) ||
    /return\s+`/.test(line)
  );
}

export interface LocaleViolation {
  line: number;
  text: string;
  match: string;
  suggestion: string;
}

export function scanLocaleSource(src: string): LocaleViolation[] {
  const code = stripComments(src);
  const offenders: LocaleViolation[] = [];

  code.split("\n").forEach((line, index) => {
    if (!isUserFacingLine(line)) return;

    const literals = extractStringLiterals(line);
    const haystacks = literals.length > 0 ? literals : [line];

    for (const chunk of haystacks) {
      const match = chunk.match(ENGLISH_UI_PATTERN);
      if (!match || isAllowlisted(line, match[0]!)) continue;
      offenders.push({
        line: index + 1,
        text: line.trim(),
        match: match[0]!,
        suggestion: ENGLISH_SUGGESTIONS[match[0]!] ?? "Prevedi na crnogorski/srpski UI ton",
      });
    }
  });

  return offenders;
}

export function scanLocaleFile(absPath: string): LocaleViolation[] {
  return scanLocaleSource(readFileSync(absPath, "utf8"));
}

export function formatLocaleViolations(
  relPath: string,
  violations: LocaleViolation[],
): string {
  return violations
    .map(
      (v) =>
        `${relPath}:${v.line} — "${v.match}" → predlog: "${v.suggestion}"\n  ${v.text}`,
    )
    .join("\n");
}

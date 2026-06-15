import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { screen } from "@testing-library/react";
import { createTranslator } from "@/i18n/translate";
import { applyDocumentLocale } from "@/i18n/document-locale";
import { parseAppLocale } from "@/i18n/types";
import { loadAppSettings } from "@/lib/app-settings";
import { SaveStatusChip } from "@/components/ui/SaveStatusChip";
import { renderWithI18n } from "@/test/helpers/render-with-i18n";
describe("i18n", () => {
  beforeEach(() => {
    localStorage.removeItem("sr-app-settings");
    document.documentElement.lang = "";
  });

  it("parseAppLocale falls back to me for unknown values", () => {
    expect(parseAppLocale("en")).toBe("en");
    expect(parseAppLocale("fr")).toBe("me");
    expect(parseAppLocale(undefined)).toBe("me");
  });

  it("createTranslator returns Montenegrin by default", () => {
    const t = createTranslator("me");
    expect(t("common.back")).toBe("Nazad");
    expect(t("save.saved")).toBe("Sačuvano");
  });

  it("createTranslator returns English for en locale", () => {
    const t = createTranslator("en");
    expect(t("common.back")).toBe("Back");
    expect(t("dashboard.title")).toBe("Dashboard");
  });

  it("applyDocumentLocale sets html lang attribute", () => {
    applyDocumentLocale("me");
    expect(document.documentElement.lang).toBe("cnr");
    applyDocumentLocale("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("loadAppSettings defaults locale to me", () => {
    expect(loadAppSettings().locale).toBe("me");
  });

  it("SaveStatusChip renders translated label", () => {
    renderWithI18n(createElement(SaveStatusChip, { status: "saved" }));
    expect(screen.getByRole("status")).toHaveTextContent("Sačuvano");
  });});

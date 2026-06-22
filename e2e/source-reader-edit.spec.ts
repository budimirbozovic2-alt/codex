import { test, expect } from "@playwright/test";
import { E2E_CATEGORY_ID, E2E_SKRIPTA_SOURCE_ID } from "../src/e2e/fixture-ids";

const ONBOARDING_KEYS = [
  "sr-app-onboarding-seen",
  "sr-planner-onboarding-seen",
  "sr-stats-onboarding-seen",
  "sr-dashboard-onboarding-seen",
];

async function bootAndSeed(page: import("@playwright/test").Page) {
  await page.addInitScript((keys: string[]) => {
    for (const key of keys) localStorage.setItem(key, "true");
  }, ONBOARDING_KEYS);

  await page.goto("/");
  await page.waitForSelector("[data-app-mounted]");
  await page.waitForFunction(() => window.__codexE2E !== undefined);
  await page.evaluate(() => window.__codexE2E!.waitForReady());
  await page.evaluate(() => window.__codexE2E!.seedReaderFixture());
}

async function openReader(page: import("@playwright/test").Page) {
  await page.goto(`/#/category/${E2E_CATEGORY_ID}`);
  const readBtn = page.getByRole("button", { name: "Čitaj" });
  await expect(readBtn).toBeVisible({ timeout: 30_000 });
  await readBtn.click();
  await expect(page.getByRole("button", { name: "Uredi" })).toBeVisible();
}

async function openSkriptaReader(page: import("@playwright/test").Page) {
  await page.goto(`/#/category/${E2E_CATEGORY_ID}`);
  await page.waitForSelector("[data-app-mounted]");
  await page.evaluate((sourceId) => {
    sessionStorage.setItem("sr-open-source-id", sourceId);
    window.dispatchEvent(
      new CustomEvent("codex-open-source-reader", { detail: { sourceId } }),
    );
  }, E2E_SKRIPTA_SOURCE_ID);
  await expect(page.getByRole("button", { name: "Uredi" })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe.configure({ mode: "serial" });

test.describe("Source Reader — edit + bubble menu", () => {
  test.beforeEach(async ({ page }) => {
    await bootAndSeed(page);
  });

  test("edit mode autosave shows Sačuvano chip", async ({ page }) => {
    await openReader(page);
    await page.getByRole("button", { name: "Uredi" }).click();
    await expect(page.getByRole("button", { name: "Uređivanje" })).toBeVisible();

    const editor = page.locator(".source-content-host .ProseMirror");
    await editor.click();
    await page.keyboard.insertText(" Novi E2E tekst.");
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__codexE2E!.flushSourceAutosave());

    await expect(page.getByRole("status")).toContainText("Sačuvano", {
      timeout: 25_000,
    });
  });

  test("text selection shows bubble menu with Esej action", async ({ page }) => {
    await openReader(page);
    await page.getByRole("button", { name: "Uredi" }).click();

    const editor = page.locator(".source-content-host .ProseMirror");
    await editor.click();
    await page.keyboard.press("Control+A");

    await expect(
      page.getByRole("button", { name: "Napravi esej (S)" }),
    ).toBeVisible();
    await expect(page.getByText("Esej", { exact: true })).toBeVisible();
  });

  test("skripta selection can mark legal provision block", async ({ page }) => {
    await openSkriptaReader(page);
    await page.getByRole("button", { name: "Uredi" }).click();

    const editor = page.locator(".source-content-host .ProseMirror");
    const legalText = editor.getByText("Član 1. Ovo je isječak zakonskog teksta za E2E test.");
    await legalText.click({ clickCount: 3 });

    const markBtn = page.getByRole("button", { name: "Označi kao citat propisa" });
    await expect(markBtn).toBeVisible();
    await markBtn.click();

    await expect(editor.locator(".legal-provision")).toBeVisible();
    await expect(editor.locator(".legal-provision")).toContainText("Član 1.");
  });
});

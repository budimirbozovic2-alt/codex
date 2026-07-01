/**
 * TD-ARCH-10 P3 — desktop smoke checklist (Playwright proxy + Electron manual).
 *
 * Playwright runs `npm run dev -- --mode e2e` (OPFS SQLite, VITE_E2E bridge).
 * Electron manual steps use the same flows in packaged build.
 */
import { test, expect } from "@playwright/test";
import {
  E2E_SMOKE_DELETE_CATEGORY_ID,
  E2E_SMOKE_DUE_CARD_QUESTION,
} from "../src/e2e/fixture-ids";

const ONBOARDING_KEYS = [
  "sr-app-onboarding-seen",
  "sr-planner-onboarding-seen",
  "sr-stats-onboarding-seen",
  "sr-dashboard-onboarding-seen",
  "sr-review-onboarding-seen",
];

async function bootApp(page: import("@playwright/test").Page) {
  await page.addInitScript((keys: string[]) => {
    for (const key of keys) localStorage.setItem(key, "true");
  }, ONBOARDING_KEYS);

  await page.goto("/");
  await page.waitForSelector("[data-app-mounted]");
  await page.waitForFunction(() => window.__codexE2E !== undefined);
  await page.evaluate(() => window.__codexE2E!.waitForReady());
}

test.describe.configure({ mode: "serial" });

test.describe("P3 desktop smoke (e2e proxy)", () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test("1. cold boot reaches ready + hydrated caches", async ({ page }) => {
    const snapshot = await page.evaluate(() =>
      window.__codexE2E!.getPersistenceSnapshot(),
    );
    expect(snapshot.cardsHydrated).toBe(true);
    expect(snapshot.categoriesHydrated).toBe(true);
  });

  test("2. backup export → import roundtrip preserves card count", async ({
    page,
  }) => {
    await page.evaluate(() => window.__codexE2E!.seedPersistenceFixture());
    const result = await page.evaluate(() =>
      window.__codexE2E!.runBackupSmokeRoundtrip(),
    );
    expect(result.cardCountAfter).toBe(result.cardCountBefore);
    expect(result.cardCountBefore).toBeGreaterThan(0);
  });

  test("3. category delete removes empty category from UI", async ({
    page,
  }) => {
    await page.evaluate(() => window.__codexE2E!.seedEmptyCategoryForDelete());

    await page.goto("/#/categories");
    await expect(
      page.getByRole("heading", { name: "Kategorije", level: 1 }),
    ).toBeVisible({ timeout: 15_000 });
    const main = page.getByRole("main");
    await expect(
      main.getByRole("link", { name: "E2E Smoke Brisanje" }),
    ).toBeVisible();

    await main
      .getByRole("link", { name: "E2E Smoke Brisanje" })
      .locator("..")
      .locator("..")
      .getByRole("button", { name: "Obriši kategoriju" })
      .click();
    await page.getByRole("button", { name: "Obriši trajno" }).click();

    await expect(
      main.getByRole("link", { name: "E2E Smoke Brisanje" }),
    ).not.toBeVisible({ timeout: 10_000 });

    const ids = await page.evaluate(() => window.__codexE2E!.listCategoryIds());
    expect(ids).not.toContain(E2E_SMOKE_DELETE_CATEGORY_ID);
  });

  test("4. review session setup shows due work and starts", async ({
    page,
  }) => {
    await page.evaluate(() => window.__codexE2E!.seedDueReviewFixture());

    await page.goto("/#/review");
    const reviewOnboarding = page.getByRole("dialog");
    if (await reviewOnboarding.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Dalje" }).click();
      await page.getByRole("button", { name: "Zatvori" }).click();
    }
    await expect(
      page.getByRole("radio", { name: /Fokusirano utvrđivanje/i }),
    ).toBeVisible({ timeout: 30_000 });

    const startBtn = page.getByRole("button", { name: /Počni konsolidaciju/i });
    await expect(startBtn).toBeEnabled({ timeout: 15_000 });
    await startBtn.click();

    await expect(page.getByText(E2E_SMOKE_DUE_CARD_QUESTION)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("5. Stats and Planner tabs render deferred analytics shell", async ({
    page,
  }) => {
    await page.evaluate(() => window.__codexE2E!.seedPersistenceFixture());

    await page.goto("/#/stats");
    await expect(page.getByRole("heading", { name: "Statistika" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Analitika", { exact: true })).toBeVisible();

    await page.goto("/#/planner");
    const wizard = page.getByRole("dialog", { name: "Podešavanje plana učenja" });
    await wizard.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    if (await wizard.isVisible()) {
      await wizard.getByRole("button", { name: "Otkaži" }).click();
    }
    await expect(
      page.getByRole("main").getByText("Planiranje", { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole("main").getByRole("heading", {
        level: 1,
        name: "Strateški planer",
      }),
    ).toBeVisible({ timeout: 60_000 });
  });
});

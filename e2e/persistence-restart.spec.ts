import { test, expect } from "@playwright/test";
import {
  E2E_PERSIST_CATEGORY_ID,
  E2E_PERSIST_CARD_ID,
  E2E_PERSIST_CARD_QUESTION,
} from "../src/e2e/fixture-ids";

const ONBOARDING_KEYS = [
  "sr-app-onboarding-seen",
  "sr-planner-onboarding-seen",
  "sr-stats-onboarding-seen",
  "sr-dashboard-onboarding-seen",
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

test.describe("Persistence restart contract (Faza 0)", () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test("card survives simulated session restart (SQLite + boot cache)", async ({
    page,
  }) => {
    await page.evaluate(() => window.__codexE2E!.seedPersistenceFixture());

    await page.goto(`/#/subject/${E2E_PERSIST_CATEGORY_ID}/cards`);
    await expect(page.getByText(E2E_PERSIST_CARD_QUESTION)).toBeVisible({
      timeout: 30_000,
    });

    await page.evaluate(() => window.__codexE2E!.simulateSessionRestart());

    const snapshot = await page.evaluate(() =>
      window.__codexE2E!.getPersistenceSnapshot(),
    );

    expect(snapshot.cardIds).toContain(E2E_PERSIST_CARD_ID);
    expect(snapshot.categoryIds).toContain(E2E_PERSIST_CATEGORY_ID);
    expect(snapshot.cardsHydrated).toBe(true);
    expect(snapshot.categoriesHydrated).toBe(true);
  });
});

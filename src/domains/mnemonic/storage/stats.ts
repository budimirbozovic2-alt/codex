import type { MnemonicCard } from "../types";

export function getMnemonicStats(cards: MnemonicCard[]) {
  const total = cards.length;
  let newCount = 0, workshopCount = 0, readyCount = 0, testedSum = 0, testedCount = 0;
  for (const c of cards) {
    if (c.mnemonicStatus === "new") newCount++;
    else if (c.mnemonicStatus === "in-workshop") workshopCount++;
    else readyCount++;
    if (c.testCount > 0) { testedSum += (c.successCount / c.testCount) * 100; testedCount++; }
  }
  const avgSuccess = testedCount > 0 ? Math.round(testedSum / testedCount) : 0;
  return { total, newCount, workshopCount, readyCount, avgSuccess };
}

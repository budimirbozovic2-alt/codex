/**
 * PR-7f M2 — TanStack read-path za mnemonic kartice.
 *
 * Invalidacija je event-driven: `domain:changed{mnemonics}` u `bridges.ts`
 * invalidira `['mnemonics']` kad god mnemonic repo emituje promjenu.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  loadMnemonicCards,
  loadMnemonicCardsByCategory,
  type MnemonicCard,
} from "@/features/mnemonic/mnemonic-storage";
import { queryKeys } from "@/lib/query/keys";

const EMPTY: MnemonicCard[] = [];

export function useMnemonicCards(categoryFilter?: string): {
  cards: MnemonicCard[];
  ready: boolean;
} {
  const { data, isSuccess } = useQuery({
    queryKey: categoryFilter
      ? queryKeys.mnemonics.byCategory(categoryFilter)
      : queryKeys.mnemonics.all(),
    queryFn: () =>
      categoryFilter ? loadMnemonicCardsByCategory(categoryFilter) : loadMnemonicCards(),
    // C1 — keep previous filter's cards visible during refetch.
    placeholderData: keepPreviousData,
  });
  return { cards: data ?? EMPTY, ready: isSuccess };
}

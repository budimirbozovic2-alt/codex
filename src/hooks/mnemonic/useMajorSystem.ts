/**
 * PR-7f M2 — TanStack read-path za Major System pegove.
 * Invalidacija: `domain:changed{mnemonics}` u `bridges.ts` (saveMajorSystem
 * fire-uje `notifyMnemonics`).
 */
import { useQuery } from "@tanstack/react-query";
import {
  loadMajorSystem,
  DEFAULT_MAJOR_SYSTEM,
} from "@/features/mnemonic/mnemonic-storage";
import { queryKeys } from "@/lib/query/keys";

export function useMajorSystem(): {
  system: Record<number, string>;
  ready: boolean;
} {
  const { data, isSuccess } = useQuery({
    queryKey: queryKeys.mnemonics.majorSystem(),
    queryFn: () => loadMajorSystem(),
  });
  return { system: data ?? DEFAULT_MAJOR_SYSTEM, ready: isSuccess };
}

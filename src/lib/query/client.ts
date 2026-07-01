/**
 * Singleton QueryClient for TanStack Query.
 * Read-cache above existing SSOT storage modules.
 */
import { QueryClient } from "@tanstack/react-query";

const CLIENT_KEY = Symbol.for("codex.queryclient");

interface CodexGlobalClient {
  [CLIENT_KEY]?: QueryClient;
}
const slots = globalThis as typeof globalThis & CodexGlobalClient;

if (!slots[CLIENT_KEY]) {
  slots[CLIENT_KEY] = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryClient: QueryClient = slots[CLIENT_KEY];

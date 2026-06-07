/**
 * Singleton QueryClient for TanStack Query.
 * Read-cache above existing SSOT storage modules.
 *
 * PR-H7 Hardening: Pinned QueryClient to globalThis
 * via unique Symbol to survive Vite HMR re-evaluations
 * and preserve subscription integrity with bridges.
 */
import { QueryClient } from "@tanstack/react-query";
import { installQueryBridges } from "./bridges";

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

  // Mostove instaliramo tacno jednom za stabilnu instancu
  installQueryBridges(slots[CLIENT_KEY]);
}

export const queryClient: QueryClient = slots[CLIENT_KEY];
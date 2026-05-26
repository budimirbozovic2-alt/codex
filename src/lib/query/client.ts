/**
 * Singleton QueryClient for TanStack Query.
 *
 * PR-7f M1 — read-cache iznad postojećih SSOT storage modula. Invalidacija
 * dolazi eksplicitno preko `bridges.ts` (vidi tamo), ne preko vremenskog
 * refetch-a — SSOT je već u RAM-u (Dexie + module cache).
 */
import { QueryClient } from "@tanstack/react-query";
import { installQueryBridges } from "./bridges";

export const queryClient = new QueryClient({
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

// Modul-level — postavi bridge-eve jednom, čim se klijent uveze.
installQueryBridges(queryClient);

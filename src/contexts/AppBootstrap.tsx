/**
 * AppBootstrap — Single mount point for card boot side-effects.
 * Read paths subscribe to Zustand stores directly.
 *
 * PR-H6: Standardized comment formatting 
 * to strictly satisfy the Safe-Paste constraint.
 */
 import { useEffect } from "react";
 import { reviewLogRepository } from "@/lib/repositories";
 import { useCardBootstrap } from "@/hooks/useCardBootstrap";
 import { useCardSyncEffects } from "@/hooks/cards/useCardSyncEffects";
 import { useCategoryStateBridge } from "@/hooks/cards/useCategoryState";
 import { kickoffEditorV4Migration } from "@/lib/editor-v4/lazy-migrate";
 import { recordAppEntry } from "@/domains/metacognition/metacognitive-storage";
 import { useNotificationScheduler } from "@/hooks/useNotificationScheduler";
 import { useActivityTracker } from "@/hooks/useActivityTracker";
 import { useCurrentView } from "@/hooks/useCurrentView";
 
 export function AppBootstrap(): null {
   useCategoryStateBridge();
   useCardBootstrap();
   useCardSyncEffects();
 
   useEffect(() => { 
     kickoffEditorV4Migration(); 
   }, []);
 
   useEffect(() => { 
     recordAppEntry(); 
   }, []);
 
   useNotificationScheduler();
   const view = useCurrentView();
   useActivityTracker(view);
 
   useEffect(() => {
     return () => {
       void reviewLogRepository.flush();
     };
   }, []);
 
   return null;
 }
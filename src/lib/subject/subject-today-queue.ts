import type { Card, SRSettings } from "@/lib/spaced-repetition";

import { getDueCards } from "@/lib/spaced-repetition";

import { isEndangeredEssay } from "@/lib/saga/endangered-display";

import { countConsolidationEligibleCards } from "@/lib/review-mode-builder";



export interface SubjectTodayStats {

  /** Konsolidacija — kartice sa ≥1 sekcijom u bilo kojem review režimu. */

  dueForConsolidation: number;

  /** Još nisu pasivno pročitane — ide u Learn. */

  unread: number;

  /** Ugrožene esejske sage — ide u Learn (saga-rehab). */

  endangeredSagas: number;

}



/** SuperMemo-style priority snapshot for one subject scope. */

export function computeSubjectTodayStats(

  cards: readonly Card[],

  srSettings: SRSettings,

  now: number = Date.now(),

): SubjectTodayStats {

  let dueForConsolidation = 0;

  let unread = 0;

  let endangeredSagas = 0;



  const dueCards = getDueCards([...cards]);

  dueForConsolidation = countConsolidationEligibleCards({

    dueCards,

    allCards: [...cards],

    srSettings,

    now,

  });



  for (const card of cards) {

    if ((card.readCount ?? 0) === 0) unread++;

    if (isEndangeredEssay(card)) endangeredSagas++;

  }



  return { dueForConsolidation, unread, endangeredSagas };

}


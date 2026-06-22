import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { BookOpen, Pencil, Zap } from "lucide-react";

import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

import { Skeleton } from "@/components/ui/skeleton";

import type { Card } from "@/lib/spaced-repetition";

import type { SubcategoryNode } from "@/lib/db-types";

import { useCardOnlyActions } from "@/hooks/cards/useActions";

import { groupCardsForSagaDisplay } from "@/lib/saga/card-saga-grouping";

import { sortPassiveReaderCards } from "./passive-reader/sort-passive-reader-cards";

import { usePassiveReaderFilters } from "./passive-reader/usePassiveReaderFilters";

import { usePassiveReaderNavigation } from "./passive-reader/usePassiveReaderNavigation";

import { useCardStats } from "./passive-reader/useCardStats";

import { PassiveReaderFilters } from "./passive-reader/PassiveReaderFilters";

import { PassiveReaderPager } from "./passive-reader/PassiveReaderPager";

import { PassiveReaderSatellitePanel } from "./passive-reader/PassiveReaderSatellitePanel";



const PassiveReaderCard = lazy(() =>

  import("./passive-reader/PassiveReaderCard").then(m => ({ default: m.PassiveReaderCard })),

);



function PassiveReaderCardSkeleton() {

  return (

    <Skeleton

      className="rounded-2xl border border-border/60"

      style={{ height: 420 }}

      role="status"

      aria-busy="true"

      aria-label="Učitavanje kartice…"

    />

  );

}



interface Props {

  cards: Card[];

  subcategoryNodes: SubcategoryNode[];

  categoryId: string;

  onEditCard?: (card: Card) => void;

  initialCardId?: string | null;

  onInitialConsumed?: () => void;

}



export default function PassiveReader({

  cards, subcategoryNodes, categoryId, onEditCard, initialCardId, onInitialConsumed,

}: Props) {

  const navigate = useNavigate();

  const filters = usePassiveReaderFilters(categoryId, subcategoryNodes);



  const filtered = useMemo(() => {

    let list = cards.slice();

    if (filters.subFilter !== "all") list = list.filter(c => c.subcategoryId === filters.subFilter);

    if (filters.chapterFilter !== "all") list = list.filter(c => c.chapterId === filters.chapterFilter);

    if (filters.typeFilter !== "all") list = list.filter(c => c.type === filters.typeFilter);

    return list.sort(sortPassiveReaderCards);

  }, [cards, filters.subFilter, filters.chapterFilter, filters.typeFilter]);



  const sagaDisplay = useMemo(() => groupCardsForSagaDisplay(filtered), [filtered]);

  const readerQueue = sagaDisplay.topLevelCards;



  const { index, next, prev } = usePassiveReaderNavigation({

    cards, filtered: readerQueue, filters, initialCardId, onInitialConsumed,

  });



  const current = readerQueue[index];

  const currentSatellites = current?.type === "essay"

    ? (sagaDisplay.satellitesByParent.get(current.id) ?? [])

    : [];



  const [expandedSatelliteId, setExpandedSatelliteId] = useState<string | null>(null);

  useEffect(() => {

    setExpandedSatelliteId(null);

  }, [index]);



  const stats = useCardStats(current);

  const { markRead } = useCardOnlyActions();



  const lastMarkedIndexRef = useRef<number | null>(null);

  useEffect(() => {

    if (!current) {

      lastMarkedIndexRef.current = null;

      return;

    }

    if (lastMarkedIndexRef.current === index) return;

    lastMarkedIndexRef.current = index;

    markRead(current.id);

  }, [index, current, markRead]);



  const toggleSatellite = (satelliteId: string) => {

    setExpandedSatelliteId(prev => (prev === satelliteId ? null : satelliteId));

  };



  return (

    <div className="space-y-4">

      <PassiveReaderFilters

        filters={filters}

        subcategoryNodes={subcategoryNodes}

        total={readerQueue.length}

        index={index}

      />



      {current && (

        <div className="flex flex-wrap items-center gap-2">

          <Button

            type="button"

            size="sm"

            variant="outline"

            className="gap-1.5 h-8 text-xs"

            onClick={() =>

              navigate(`/learn?category=${categoryId}&mode=strict-recall&card=${current.id}`)

            }

          >

            <Zap className="h-3.5 w-3.5" />

            Testiraj ovaj blok

          </Button>

          <div className="ml-auto">

            <Button

              type="button"

              size="sm"

              variant="outline"

              className="gap-1.5 h-8 text-xs"

              onClick={() => onEditCard?.(current)}

              disabled={!onEditCard}

            >

              <Pencil className="h-3.5 w-3.5" />

              Uredi karticu

            </Button>

          </div>

        </div>

      )}



      {!current ? (

        <div className="glass-card rounded-xl p-12 text-center text-sm text-muted-foreground">

          <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />

          Nema kartica za prikaz uz odabrane filtere.

        </div>

      ) : (

        <div

          className={

            currentSatellites.length > 0

              ? "grid grid-cols-1 lg:grid-cols-3 gap-4 items-start"

              : undefined

          }

        >

          <div className={currentSatellites.length > 0 ? "lg:col-span-2 min-w-0" : undefined}>

            <Suspense fallback={<PassiveReaderCardSkeleton />}>

              <PassiveReaderCard key={current.id} card={current} stats={stats} />

            </Suspense>

          </div>

          {currentSatellites.length > 0 && (

            <aside className="lg:col-span-1 lg:sticky lg:top-4 self-start min-w-0">

              <PassiveReaderSatellitePanel

                satellites={currentSatellites}

                expandedId={expandedSatelliteId}

                onToggle={toggleSatellite}

              />

            </aside>

          )}

        </div>

      )}



      <PassiveReaderPager

        index={index}

        total={readerQueue.length}

        onPrev={prev}

        onNext={next}

      />

    </div>

  );

}



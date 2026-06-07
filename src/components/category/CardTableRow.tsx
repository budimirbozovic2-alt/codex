/**
 * PR-G6 / RC-6 — Extracted memoized row for CardViewTable.
 * Wrap in React.memo for high-performance updates.
 *
 * PR-H5 Hardening: Primitive flattened props to bypass
 * reference changes. Integrated Chromium hardware virtualization.
 */
 import { memo } from "react";
 import { ContentRenderer } from "@/components/ui/ContentRenderer";
 import {
   ChevronDown, ChevronRight, ArrowRightLeft, Flame, Link2, BookOpen,
   AlertTriangle, Pencil, Trash2,
 } from "lucide-react";
 import { Checkbox } from "@/components/ui/checkbox";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { type Card, SectionState } from "@/lib/spaced-repetition";
 import type { FrequencyTag } from "@/lib/sr/types";
 import { getFrequencyMeta } from "@/lib/sr/frequency";
 import { cn } from "@/lib/utils";
 import FrequencyMenu from "@/components/card-list/FrequencyMenu";
 
 function stabilityLabel(s: number): { text: string; color: string } {
   if (s >= 30) return { text: "Stabilno", color: "text-success" };
   if (s >= 7) return { text: "Srednje", color: "text-warning" };
   return { text: "Slabo", color: "text-destructive" };
 }
 
 interface Props {
   card: Card;
   isExpanded: boolean;
   isSelected: boolean;
   selectionMode: boolean;
   subName: string | undefined;
   subStale: boolean;
   chapName: string | undefined;
   chapStale: boolean;
   onToggle: (id: string) => void;
   onToggleSelection: (id: string) => void;
   setFrequency: (cardId: string, value: FrequencyTag | null) => void;
   onEdit?: (card: Card) => void;
   onPassiveRead?: (card: Card) => void;
   onDelete?: (id: string) => void;
   onOpenMoveModal: (cardId: string) => void;
 }
 
 function CardTableRowInner({
   card, isExpanded, isSelected, selectionMode,
   subName, subStale, chapName, chapStale,
   onToggle, onToggleSelection, setFrequency, 
   onEdit, onPassiveRead, onDelete, onOpenMoveModal,
 }: Props) {
   const avgStability = card.sections.length > 0
     ? card.sections.reduce((sum, s) => sum + s.stability, 0) / card.sections.length
     : 0;
   const stab = stabilityLabel(avgStability);
 
   return (
     <div 
       className="rounded-lg border bg-card overflow-hidden"
       style={{
         // PR-H5: Nativna Chromium virtuelizacija layout-a.
         contentVisibility: "auto",
         containIntrinsicSize: isExpanded ? "400px" : "50px",
       }}
     >
       <div className="w-full flex items-center gap-3 px-4 py-3">
         {selectionMode && (
           <Checkbox
             checked={isSelected}
             onCheckedChange={() => onToggleSelection(card.id)}
             className="shrink-0"
           />
         )}
         <button
           onClick={() => onToggle(card.id)}
           className="flex-1 flex items-center gap-3 text-left hover:bg-accent/30 transition-colors rounded min-w-0"
         >
           {isExpanded
             ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
             : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
           }
           <span className="text-sm text-foreground truncate flex-1">
             {card.question || "(Bez pitanja)"}
           </span>
           <div className="flex items-center gap-2 shrink-0">
             {card.frequencyTag && (
               <Flame className={cn("h-3.5 w-3.5", getFrequencyMeta(card.frequencyTag).iconClass)} />
             )}
             <span className={cn("text-[10px] font-medium", stab.color)}>
               {stab.text}
             </span>
             <Badge variant="outline" className="text-[10px]">
               {card.type === "flash" ? "Flash" : "Esej"}
             </Badge>
           </div>
         </button>
         {!selectionMode && (onEdit || onPassiveRead) && (
           <div className="flex items-center gap-0.5 shrink-0">
             {onEdit && (
               <Button
                 type="button"
                 variant="ghost"
                 size="icon"
                 className="h-7 w-7 text-muted-foreground hover:text-foreground"
                 onClick={(e) => { e.stopPropagation(); onEdit(card); }}
                 title="Uredi karticu"
                 aria-label="Uredi karticu"
               >
                 <Pencil className="h-3.5 w-3.5" />
               </Button>
             )}
             {onPassiveRead && (
               <Button
                 type="button"
                 variant="ghost"
                 size="icon"
                 className="h-7 w-7 text-muted-foreground hover:text-foreground"
                 onClick={(e) => { e.stopPropagation(); onPassiveRead(card); }}
                 title="Pasivno čitanje ove kartice"
                 aria-label="Pasivno čitanje ove kartice"
               >
                 <BookOpen className="h-3.5 w-3.5" />
               </Button>
             )}
           </div>
         )}
       </div>
 
       {isExpanded && (
         <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
           <div className="flex items-center gap-2 flex-wrap">
             {card.subcategoryId && (
               <>
                 <Badge
                   variant="secondary"
                   className={`text-[10px] ${subStale ? "bg-warning/15 text-warning border-warning/30" : ""}`}
                   title={subStale ? `UUID ${card.subcategoryId} ne postoji` : undefined}
                 >
                   Potkategorija: {subStale ? "(zastarjela veza)" : subName}
                 </Badge>
                 {(chapName || chapStale) && (
                   <Badge
                     variant="outline"
                     className={`text-[10px] gap-1 ${chapStale ? "bg-warning/15 text-warning border-warning/30" : "border-primary/30"}`}
                     title={chapStale ? `UUID ${card.chapterId} ne postoji` : undefined}
                   >
                     <BookOpen className="h-3 w-3" />
                     Glava: {chapStale ? "(zastarjela veza)" : chapName}
                   </Badge>
                 )}
               </>
             )}
             {!card.subcategoryId && card.chapterId && (
               <Badge
                 variant="outline"
                 className={`text-[10px] gap-1 ${chapStale ? "bg-warning/15 text-warning border-warning/30" : "border-primary/30"}`}
                 title={chapStale ? `UUID ${card.chapterId} ne postoji` : undefined}
               >
                 <BookOpen className="h-3 w-3" />
                 Glava: {chapStale ? "(zastarjela veza)" : chapName}
               </Badge>
             )}
             {card.sourceId && (
               <Badge variant="outline" className="text-[10px] gap-1 border-accent">
                 <Link2 className="h-3 w-3" /> Povezano sa izvorom
               </Badge>
             )}
             {card.needsReview && (
               <Badge className="text-[10px] gap-1 bg-warning/15 text-warning border-warning/30">
                 <AlertTriangle className="h-3 w-3" /> Izvor ažuriran
               </Badge>
             )}
           </div>
 
           <div className="space-y-2">
             {card.sections.map((section, idx) => {
               const secStab = stabilityLabel(section.stability);
               const stateLabel = section.state === SectionState.New
                 ? "Novo" : section.state === SectionState.Learning
                 ? "Učenje" : section.state === SectionState.Review
                 ? "Ponavljanje" : "Re-učenje";
               return (
                 <div key={section.id} className="rounded border bg-background p-3 space-y-1">
                   <div className="flex items-center justify-between">
                     <span className="text-xs font-medium text-foreground">
                       {section.title || `Sekcija ${idx + 1}`}
                     </span>
                     <div className="flex items-center gap-2">
                       <span className="text-[10px] text-muted-foreground">{stateLabel}</span>
                       <span className={cn("text-[10px] font-medium", secStab.color)}>
                         S: {section.stability.toFixed(1)}
                       </span>
                     </div>
                   </div>
                   <ContentRenderer 
                     className="text-xs prose prose-xs max-w-none line-clamp-4 card-prose" 
                     doc={section.contentDoc} 
                   />
                 </div>
               );
             })}
           </div>
 
           <div className="flex items-center gap-1.5 flex-wrap">
             <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
               Frekventnost:
             </span>
             <FrequencyMenu card={card} setFrequency={setFrequency} size="sm" />
             {card.frequencyTag && (
               <span className="text-[10px] text-muted-foreground">
                 {getFrequencyMeta(card.frequencyTag).label}
               </span>
             )}
           </div>
 
           <div className="flex items-center gap-2 flex-wrap">
             {onEdit && (
               <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onEdit(card)}>
                 <Pencil className="h-3.5 w-3.5" /> Uredi
               </Button>
             )}
             <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => onOpenMoveModal(card.id)}>
               <ArrowRightLeft className="h-3.5 w-3.5" /> Premjesti
             </Button>
             {onDelete && (
               <Button 
                 variant="outline" 
                 size="sm" 
                 className="gap-1.5 text-xs text-destructive hover:bg-destructive/10" 
                 onClick={() => onDelete(card.id)}
               >
                 <Trash2 className="h-3.5 w-3.5" /> Obriši
               </Button>
             )}
           </div>
         </div>
       )}
     </div>
   );
 }
 
 export const CardTableRow = memo(CardTableRowInner, (prev, next) =>
   // PR-H5 Bezbjednosna ispravka: Oslanjamo se iskljucivo na 
   // updatedAt jer se reference objekata u TanStack upitu
   // stalno mijenjaju pri svakom novom povlacenju.
   prev.card.updatedAt === next.card.updatedAt &&
   prev.isExpanded === next.isExpanded &&
   prev.isSelected === next.isSelected &&
   prev.selectionMode === next.selectionMode &&
   prev.subName === next.subName &&
   prev.subStale === next.subStale &&
   prev.chapName === next.chapName &&
   prev.chapStale === next.chapStale &&
   prev.onToggle === next.onToggle &&
   prev.onToggleSelection === next.onToggleSelection &&
   prev.setFrequency === next.setFrequency &&
   prev.onEdit === next.onEdit &&
   prev.onPassiveRead === next.onPassiveRead &&
   prev.onDelete === next.onDelete &&
   prev.onOpenMoveModal === next.onOpenMoveModal
 );
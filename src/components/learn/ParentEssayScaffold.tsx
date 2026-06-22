import React from "react";
import { CardSelectionEditor } from "@/components/card-list/CardSelectionEditor";
import { Card } from "@/lib/spaced-repetition";
import { BookOpen } from "lucide-react";

interface Props {
  essay: Card;
}

/** Locked, dimmed parent essay shown as mental scaffold during Blic juriš. */
const ParentEssayScaffold = React.memo(function ParentEssayScaffold({ essay }: Props) {
  const sections = essay.sections ?? [];

  return (
    <div
      className="pointer-events-none select-none opacity-40 space-y-3"
      aria-hidden="true"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
        <BookOpen className="h-3.5 w-3.5" />
        Kontekst eseja
      </div>
      <p className="text-lg font-medium leading-relaxed">{essay.question}</p>
      <div className="space-y-3">
        {sections.length > 0 ? (
          sections.map((section) => (
            <div key={section.id} className="rounded-xl border bg-card/80 p-4">
              <p className="font-medium text-sm mb-2">{section.title}</p>
              <CardSelectionEditor
                cardId={essay.id}
                question={essay.question}
                category={essay.categoryId}
                subcategoryId={essay.subcategoryId}
                tags={essay.tags}
                keyParts={essay.keyParts}
                categoryId={essay.categoryId}
                contentDoc={section.contentDoc}
                className="text-sm leading-relaxed prose prose-sm max-w-none card-prose"
              />
            </div>
          ))
        ) : (
          <div className="rounded-xl border bg-card/80 p-4 text-sm text-muted-foreground italic">
            Nema dostupnog sadržaja eseja.
          </div>
        )}
      </div>
    </div>
  );
});

export default ParentEssayScaffold;

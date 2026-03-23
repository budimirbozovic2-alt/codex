import { useMemo } from "react";
import { default as Check } from "lucide-react/dist/esm/icons/check";
import { default as Link2 } from "lucide-react/dist/esm/icons/link-2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Card } from "@/lib/spaced-repetition";
import type { Source } from "@/lib/sources-storage";
import { getCoveredSourceArticles } from "@/lib/source-coverage";
import { cn } from "@/lib/utils";

interface Props {
  source: Source;
  cards: Card[];
  onOpenCard: (cardId: string) => void;
}

export default function CoverageArticleList({ source, cards, onOpenCard }: Props) {
  const articles = useMemo(
    () => getCoveredSourceArticles(source.htmlContent, cards, source.id),
    [source.htmlContent, cards, source.id]
  );

  if (articles.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Nema detektovanih članova za coverage prikaz u ovom izvoru.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-coverage-container>
      {articles.map(article => {
        const primaryCardId = article.linkedCardIds[0];

        return (
          <section
            key={article.key}
            className={cn(
              "relative overflow-hidden rounded-xl border bg-card px-5 py-4 transition-colors",
              article.processed && "border-success/30 bg-success/10"
            )}
          >
            {article.processed && (
              <div className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-success" aria-hidden="true" />
            )}

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={article.processed ? "default" : "outline"} className={cn(article.processed && "bg-success text-success-foreground hover:bg-success") }>
                    Član {article.articleNum}
                  </Badge>
                  {article.title && (
                    <h3 className="text-sm font-semibold text-foreground">{article.title}</h3>
                  )}
                </div>
                {article.processed && article.matchedModules.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Pokriveno: {article.matchedModules.map(module => module.question).join(" · ")}
                  </p>
                )}
              </div>

              {article.processed && primaryCardId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-2 text-success hover:text-success"
                  onClick={() => onOpenCard(primaryCardId)}
                  title="Otvori povezani esej u bazi"
                >
                  <Check className="h-3.5 w-3.5" />
                  <Link2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div
              className="mt-3 prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-a:text-primary prose-ul:text-foreground/90 prose-ol:text-foreground/90 prose-li:text-foreground/90"
              dangerouslySetInnerHTML={{ __html: article.contentHtml }}
            />
          </section>
        );
      })}
    </div>
  );
}
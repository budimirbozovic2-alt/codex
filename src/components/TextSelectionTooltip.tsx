import { Brain, Star } from "lucide-react";
import { useState, useEffect, useCallback, useRef, ReactNode } from "react";


import { createMnemonicCardFromSelection, loadMnemonicCards, saveMnemonicCards } from "@/lib/mnemonic-storage";
import { toast } from "@/hooks/use-toast";
interface Props {
  children: ReactNode;
  cardId: string;
  question: string;
  category: string;
  subcategory?: string;
  tags?: string[];
  keyParts?: string[];
  onMarkKeyPart?: (text: string) => void;
}

export default function TextSelectionTooltip({ children, cardId, question, category, subcategory, tags, keyParts, onMarkKeyPart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const handleMouseUp = useCallback(() => {
    // Small delay to let selection finalize
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !containerRef.current) {
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 5) return;

      // Check selection is within our container
      const range = sel.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) return;

      const rect = range.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      setTooltip({
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top - containerRect.top - 8,
        text,
      });
    }, 10);
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    // Don't dismiss if clicking the tooltip itself
    const target = e.target as HTMLElement;
    if (target.closest("[data-mnemo-tooltip]")) return;
    setTooltip(null);
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [handleMouseDown]);

  const handleAdd = useCallback(() => {
    if (!tooltip) return;
    const cards = loadMnemonicCards();
    const clone = createMnemonicCardFromSelection(
      cardId, question, tooltip.text, category, subcategory, tags
    );
    saveMnemonicCards([...cards, clone]);
    toast({ title: "Dodano u Mnemo radionicu", description: `"${tooltip.text.slice(0, 40)}${tooltip.text.length > 40 ? "…" : ""}"` });
    setTooltip(null);
    window.getSelection()?.removeAllRanges();
  }, [tooltip, cardId, question, category, subcategory, tags]);

  const handleKeyPart = useCallback(() => {
    if (!tooltip || !onMarkKeyPart) return;
    const isAlreadyMarked = (keyParts || []).some(p => p === tooltip.text.trim());
    onMarkKeyPart(tooltip.text);
    toast({
      title: isAlreadyMarked ? "Uklonjena oznaka" : "Označeno kao ključni dio",
      description: `"${tooltip.text.slice(0, 40)}${tooltip.text.length > 40 ? "…" : ""}"`,
    });
    setTooltip(null);
    window.getSelection()?.removeAllRanges();
  }, [tooltip, onMarkKeyPart, keyParts]);

  return (
    <div ref={containerRef} className="relative" onMouseUp={handleMouseUp}>
      {children}
      {tooltip && (
        <div
          data-mnemo-tooltip
          className="absolute z-50 -translate-x-1/2 -translate-y-full animate-in fade-in-0 zoom-in-95 duration-150"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="flex items-center gap-1 mb-1">
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium shadow-lg hover:bg-primary/90 transition-colors"
            >
              <Brain className="h-3.5 w-3.5" />
              Mnemo kuka
            </button>
            {onMarkKeyPart && tooltip && (
              (() => {
                const isMarked = (keyParts || []).some(p => p === tooltip.text.trim());
                return (
                  <button
                    onClick={handleKeyPart}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg transition-colors ${
                      isMarked
                        ? "bg-muted text-muted-foreground hover:bg-muted/80"
                        : "bg-warning text-warning-foreground hover:bg-warning/90"
                    }`}
                  >
                    <Star className="h-3.5 w-3.5" />
                    {isMarked ? "Ukloni oznaku" : "Ključni dio"}
                  </button>
                );
              })()
            )}
          </div>
          <div className="w-2.5 h-2.5 bg-primary rotate-45 mx-auto -mt-1.5" />
        </div>
      )}
    </div>
  );
}

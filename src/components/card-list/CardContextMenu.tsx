import { MoreVertical, FolderOpen, BookOpen, Flame, Brain, Check, ChevronRight } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { Card } from "@/lib/spaced-repetition";

interface CardContextMenuProps {
  card: Card;
  categories?: string[];
  subcategories?: Record<string, string[]>;
  availableChapters?: string[];
  onMoveCategory?: (cardId: string, category: string, subcategory?: string) => void;
  onAssignChapter?: (cardId: string, chapter: string) => void;
  onToggleTag: (cardId: string, tag: string) => void;
  onCloneToMnemonic?: (card: Card) => void;
}

function CardContextMenuInner({ card, categories, subcategories, availableChapters, onMoveCategory, onAssignChapter, onToggleTag, onCloneToMnemonic }: CardContextMenuProps) {
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<"category" | "subcategory" | "chapter" | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSubmenu(null);
        setSelectedCat(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const cardTags = card.tags || [];
  const isFrequent = cardTags.includes("često-na-ispitu");
  const hasMnemoTag = cardTags.includes("mnemonic");

  const menuItems: { icon: typeof FolderOpen; label: string; action: () => void; active?: boolean }[] = [];

  if (categories && categories.length > 0 && onMoveCategory) {
    menuItems.push({ icon: FolderOpen, label: "Premjesti u kategoriju", action: () => setSubmenu("category") });
  }
  if (availableChapters && availableChapters.length > 0 && onAssignChapter) {
    menuItems.push({ icon: BookOpen, label: "Dodijeli glavu", action: () => setSubmenu("chapter") });
  }
  menuItems.push({ icon: Flame, label: isFrequent ? "Ukloni 'Često na ispitu'" : "Označi 'Često na ispitu'", action: () => { onToggleTag(card.id, "često-na-ispitu"); setOpen(false); }, active: isFrequent });
  if (onCloneToMnemonic) {
    menuItems.push({ icon: Brain, label: hasMnemoTag ? "Već u Mnemo radionici" : "Kloniraj u Mnemo radionicu", action: () => { if (!hasMnemoTag) { onCloneToMnemonic(card); setOpen(false); } }, active: hasMnemoTag });
  }

  const subs = selectedCat ? (subcategories?.[selectedCat] || []) : [];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); setSubmenu(null); setSelectedCat(null); }}
        className="p-2 hover:bg-secondary rounded-lg transition-colors"
        title="Više opcija"
      >
        <MoreVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-xl border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
          {!submenu && (
            <div className="p-1">
              {menuItems.map(({ icon: Icon, label, action, active }) => (
                <button
                  key={label}
                  onClick={(e) => { e.stopPropagation(); action(); }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    active ? "text-primary bg-primary/5" : "text-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{label}</span>
                  {active && <Check className="h-3 w-3 ml-auto text-primary flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {submenu === "category" && (
            <div className="p-1 max-h-64 overflow-y-auto">
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Premjesti u kategoriju</p>
              {(categories || []).map(cat => (
                <button
                  key={cat}
                  onClick={(e) => {
                    e.stopPropagation();
                    const catSubs = subcategories?.[cat] || [];
                    if (catSubs.length > 0) {
                      setSelectedCat(cat);
                      setSubmenu("subcategory");
                    } else {
                      onMoveCategory!(card.id, cat);
                      setOpen(false);
                      setSubmenu(null);
                    }
                  }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    card.categoryId === cat ? "text-primary bg-primary/5" : "hover:bg-secondary"
                  }`}
                >
                  <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{cat}</span>
                  {card.categoryId === cat && <Check className="h-3 w-3 ml-auto text-primary flex-shrink-0" />}
                  {(subcategories?.[cat] || []).length > 0 && <ChevronRight className="h-3 w-3 ml-auto text-muted-foreground flex-shrink-0" />}
                </button>
              ))}
              <button onClick={(e) => { e.stopPropagation(); setSubmenu(null); }} className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground text-left">← Nazad</button>
            </div>
          )}

          {submenu === "subcategory" && selectedCat && (
            <div className="p-1 max-h-64 overflow-y-auto">
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{selectedCat} ›</p>
              <button
                onClick={(e) => { e.stopPropagation(); onMoveCategory!(card.id, selectedCat); setOpen(false); setSubmenu(null); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm hover:bg-secondary text-muted-foreground italic"
              >
                Bez podkategorije
              </button>
              {subs.map(sub => (
                <button
                  key={sub}
                  onClick={(e) => { e.stopPropagation(); onMoveCategory!(card.id, selectedCat, sub); setOpen(false); setSubmenu(null); }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    card.categoryId === selectedCat && card.subcategory === sub ? "text-primary bg-primary/5" : "hover:bg-secondary"
                  }`}
                >
                  <span className="truncate">{sub}</span>
                  {card.categoryId === selectedCat && card.subcategory === sub && <Check className="h-3 w-3 ml-auto text-primary flex-shrink-0" />}
                </button>
              ))}
              <button onClick={(e) => { e.stopPropagation(); setSubmenu("category"); setSelectedCat(null); }} className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground text-left">← Nazad</button>
            </div>
          )}

          {submenu === "chapter" && (
            <div className="p-1 max-h-64 overflow-y-auto">
              <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dodijeli glavu</p>
              {(availableChapters || []).map(ch => (
                <button
                  key={ch}
                  onClick={(e) => { e.stopPropagation(); onAssignChapter!(card.id, ch); setOpen(false); setSubmenu(null); }}
                  className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    card.chapter === ch ? "text-primary bg-primary/5" : "hover:bg-secondary"
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{ch}</span>
                  {card.chapter === ch && <Check className="h-3 w-3 ml-auto text-primary flex-shrink-0" />}
                </button>
              ))}
              <button onClick={(e) => { e.stopPropagation(); setSubmenu(null); }} className="w-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground text-left">← Nazad</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const CardContextMenu = React.memo(CardContextMenuInner);

export default CardContextMenu;

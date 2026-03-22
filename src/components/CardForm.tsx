import { useState, useMemo, useEffect } from "react";
import { Card } from "@/lib/spaced-repetition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { default as Plus } from "lucide-react/dist/esm/icons/plus";
import { default as X } from "lucide-react/dist/esm/icons/x";
import { default as GripVertical } from "lucide-react/dist/esm/icons/grip-vertical";
import { default as Scissors } from "lucide-react/dist/esm/icons/scissors";
import { default as Zap } from "lucide-react/dist/esm/icons/zap";
import { default as FileText } from "lucide-react/dist/esm/icons/file-text";
import RichTextEditor from "@/components/RichTextEditor";

interface SectionInput {
  title: string;
  content: string;
}

interface Props {
  categories: string[];
  subcategories: Record<string, string[]>;
  onSave: (question: string, sections: SectionInput[], category: string, subcategory?: string, chapter?: string) => void;
  onSaveFlash: (question: string, answer: string, category: string, subcategory?: string) => void;
  onCancel: () => void;
  editCard?: Card | null;
  onUpdate?: (id: string, updates: { question?: string; sections?: SectionInput[]; category?: string; subcategory?: string; chapter?: string }) => void;
}

type FormWidth = "compact" | "normal" | "wide" | "full";
type CardType = "essay" | "flash";

const widthClasses: Record<FormWidth, string> = {
  compact: "max-w-xl",
  normal: "max-w-2xl",
  wide: "max-w-4xl",
  full: "max-w-full",
};

const widthLabels: Record<FormWidth, string> = {
  compact: "S",
  normal: "M",
  wide: "L",
  full: "XL",
};

function parseHtmlToParagraphs(html: string): string[] {
  const div = document.createElement("div");
  div.innerHTML = html;
  const blocks: string[] = [];
  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) blocks.push(text);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (["p", "div", "br", "li"].includes(tag)) {
        const inner = el.innerHTML.trim();
        if (inner && inner !== "<br>") blocks.push(inner);
      } else {
        const outer = el.outerHTML.trim();
        if (outer) blocks.push(outer);
      }
    }
  };
  if (div.children.length === 0) {
    const parts = html.split(/<br\s*\/?>/gi).map(s => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [html];
  }
  div.childNodes.forEach(processNode);
  return blocks.length > 0 ? blocks : [html];
}

export default function CardForm({ categories, subcategories, onSave, onSaveFlash, onCancel, editCard, onUpdate }: Props) {
  const [cardType, setCardType] = useState<CardType>(editCard?.type || "essay");
  const [question, setQuestion] = useState(editCard?.question ?? "");
  const [flashAnswer, setFlashAnswer] = useState(
    editCard?.type === "flash" ? editCard.sections[0]?.content ?? "" : ""
  );
  const [sections, setSections] = useState<SectionInput[]>(
    editCard && editCard.type !== "flash"
      ? editCard.sections.map((s) => ({ title: s.title, content: s.content }))
      : [{ title: "Cjelina 1", content: "" }]
  );
  const [category, setCategory] = useState(editCard?.category ?? categories[0] ?? "Opšte");
  const [subcategory, setSubcategory] = useState(editCard?.subcategory ?? "");
  const [chapter, setChapter] = useState(editCard?.chapter ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [newSubcategory, setNewSubcategory] = useState("");
  const [showNewSub, setShowNewSub] = useState(false);
  const [newChapter, setNewChapter] = useState("");
  const [showNewChapter, setShowNewChapter] = useState(false);
  const [formWidth, setFormWidth] = useState<FormWidth>("wide");
  const [cuttingIndex, setCuttingIndex] = useState<number | null>(null);

  const availableSubs = subcategories[category] || [];

  const addSection = () => {
    setSections((prev) => [...prev, { title: `Cjelina ${prev.length + 1}`, content: "" }]);
  };

  const removeSection = (index: number) => {
    if (sections.length <= 1) return;
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSection = (index: number, field: keyof SectionInput, value: string) => {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const handleCut = (sectionIndex: number, paragraphIndex: number) => {
    const section = sections[sectionIndex];
    const paragraphs = parseHtmlToParagraphs(section.content);
    if (paragraphIndex <= 0 || paragraphIndex >= paragraphs.length) return;

    const beforeContent = paragraphs.slice(0, paragraphIndex).map(p => `<p>${p}</p>`).join("");
    const rawTitle = paragraphs[paragraphIndex].replace(/<[^>]*>/g, "");
    const tempEl = document.createElement("span");
    tempEl.innerHTML = rawTitle;
    const newTitle = (tempEl.textContent || rawTitle).trim();
    const afterContent = paragraphs.slice(paragraphIndex + 1).map(p => `<p>${p}</p>`).join("");

    setSections((prev) => {
      const updated = [...prev];
      updated[sectionIndex] = { ...updated[sectionIndex], content: beforeContent };
      updated.splice(sectionIndex + 1, 0, { title: newTitle, content: afterContent });
      return updated;
    });
    setCuttingIndex(null);
  };

  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, "").trim();

  // Get existing chapters for current category+subcategory
  // Load chapters from IDB (consistent with MentalSkeleton storage)
  const [availableChapters, setAvailableChapters] = useState<string[]>([]);
  useEffect(() => {
    const sub = showNewSub && newSubcategory.trim() ? newSubcategory.trim() : subcategory;
    const cat = showNewCat && newCategory.trim() ? newCategory.trim() : category;
    if (!sub) { setAvailableChapters([]); return; }
    const key = `chapters-${cat}-${sub}`;
    import("@/lib/db").then(({ idbLoadSettings }) => {
      idbLoadSettings<string[]>(key, []).then(chapters => {
        // Also include chapters from existing cards
        const cardChapters = new Set(chapters);
        // We don't have access to all cards here, so just use IDB stored chapters
        setAvailableChapters(Array.from(cardChapters));
      });
    });
  }, [category, subcategory, showNewCat, newCategory, showNewSub, newSubcategory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cat = showNewCat && newCategory.trim() ? newCategory.trim() : category;
    const sub = showNewSub && newSubcategory.trim() ? newSubcategory.trim() : subcategory;
    const ch = showNewChapter && newChapter.trim() ? newChapter.trim() : chapter;

    if (cardType === "flash") {
      if (!stripHtml(question) || !stripHtml(flashAnswer)) return;
      if (editCard && onUpdate) {
        onUpdate(editCard.id, {
          question,
          sections: [{ title: "Odgovor", content: flashAnswer }],
          category: cat,
          subcategory: sub,
          chapter: ch,
        });
      } else {
        onSaveFlash(question, flashAnswer, cat, sub);
      }
    } else {
      if (!stripHtml(question) || sections.some((s) => !stripHtml(s.content))) return;
      if (editCard && onUpdate) {
        onUpdate(editCard.id, { question, sections, category: cat, subcategory: sub, chapter: ch });
      } else {
        onSave(question, sections, cat, sub, ch);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`space-y-6 ${widthClasses[formWidth]} transition-all duration-300`}>
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-serif">{editCard ? "Uredi karticu" : "Nova kartica"}</h2>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1 bg-secondary rounded-lg p-1">
            {(Object.keys(widthClasses) as FormWidth[]).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setFormWidth(w)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  formWidth === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {widthLabels[w]}
              </button>
            ))}
          </div>
          <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Card type toggle */}
      {!editCard && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCardType("essay")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex-1 justify-center ${
              cardType === "essay" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <FileText className="h-4 w-4" />
            Esejsko pitanje
          </button>
          <button
            type="button"
            onClick={() => setCardType("flash")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex-1 justify-center ${
              cardType === "flash" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            <Zap className="h-4 w-4" />
            Blic pitanje
          </button>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Pitanje</label>
        <RichTextEditor
          value={question}
          onChange={setQuestion}
          placeholder={cardType === "flash" ? "Unesite pitanje..." : "Unesite esejsko pitanje..."}
          minimal
        />
      </div>

      {/* Flash card answer */}
      {cardType === "flash" ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Odgovor</label>
          <RichTextEditor
            value={flashAnswer}
            onChange={setFlashAnswer}
            placeholder="Unesite odgovor..."
          />
        </div>
      ) : (
        /* Essay sections */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-muted-foreground">Cjeline odgovora</label>
            <Button type="button" variant="outline" size="sm" onClick={addSection}>
              <Plus className="h-3 w-3 mr-1" /> Dodaj cjelinu
            </Button>
          </div>

          {sections.map((section, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                <Input
                  value={section.title}
                  onChange={(e) => updateSection(i, "title", e.target.value)}
                  placeholder="Naziv cjeline..."
                  className="bg-background font-medium text-sm"
                />
                <button
                  type="button"
                  onClick={() => setCuttingIndex(cuttingIndex === i ? null : i)}
                  className={`p-1 rounded-lg transition-colors ${
                    cuttingIndex === i
                      ? "bg-warning/20 text-warning"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                  title="Režim rezanja"
                >
                  <Scissors className="h-4 w-4" />
                </button>
                {sections.length > 1 && (
                  <button type="button" onClick={() => removeSection(i)} className="text-muted-foreground hover:text-destructive p-1">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {cuttingIndex === i ? (
                <CuttingView
                  content={section.content}
                  onCut={(pIdx) => handleCut(i, pIdx)}
                  onCancel={() => setCuttingIndex(null)}
                />
              ) : (
                <RichTextEditor
                  value={section.content}
                  onChange={(val) => updateSection(i, "content", val)}
                  placeholder="Sadržaj ove cjeline odgovora..."
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Category */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Kategorija</label>
        {!showNewCat ? (
          <div className="flex gap-2">
            <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(""); }}>
              <SelectTrigger className="bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" onClick={() => setShowNewCat(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Nova kategorija..."
              className="bg-card"
            />
            <Button type="button" variant="outline" size="icon" onClick={() => setShowNewCat(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Subcategory */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Podkategorija (opciono)</label>
        {!showNewSub ? (
          <div className="flex gap-2">
            <Select value={subcategory || "__none__"} onValueChange={(v) => setSubcategory(v === "__none__" ? "" : v)}>
              <SelectTrigger className="bg-card">
                <SelectValue placeholder="Bez podkategorije" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Bez podkategorije</SelectItem>
                {availableSubs.map((sc) => (
                  <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="icon" onClick={() => setShowNewSub(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={newSubcategory}
              onChange={(e) => setNewSubcategory(e.target.value)}
              placeholder="Nova podkategorija..."
              className="bg-card"
            />
            <Button type="button" variant="outline" size="icon" onClick={() => { setShowNewSub(false); if (newSubcategory.trim()) setSubcategory(newSubcategory.trim()); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Chapter (only for essay cards with subcategory) */}
      {cardType === "essay" && (subcategory || (showNewSub && newSubcategory.trim())) && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Glava (opciono)</label>
          {!showNewChapter ? (
            <div className="flex gap-2">
              <Select value={chapter || "__none__"} onValueChange={(v) => setChapter(v === "__none__" ? "" : v)}>
                <SelectTrigger className="bg-card">
                  <SelectValue placeholder="Bez glave" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Bez glave</SelectItem>
                  {availableChapters.map((ch) => (
                    <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setShowNewChapter(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={newChapter}
                onChange={(e) => setNewChapter(e.target.value)}
                placeholder="Nova glava (npr. Glava 1)..."
                className="bg-card"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => { setShowNewChapter(false); if (newChapter.trim()) setChapter(newChapter.trim()); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
      <Button type="submit" className="w-full">
        {editCard ? "Sačuvaj izmjene" : cardType === "flash" ? "Dodaj blic pitanje" : "Dodaj karticu"}
      </Button>
    </form>
  );
}

function CuttingView({ content, onCut, onCancel }: { content: string; onCut: (paragraphIndex: number) => void; onCancel: () => void }) {
  const paragraphs = parseHtmlToParagraphs(content);

  if (paragraphs.length <= 1) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        Nema dovoljno paragrafa za rezanje. Dodajte više teksta.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-0">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-warning">Kliknite na makazice da izrežete</span>
        <button type="button" onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">
          Otkaži
        </button>
      </div>
      {paragraphs.map((p, idx) => (
        <div key={idx}>
          {idx > 0 && (
            <button
              type="button"
              onClick={() => onCut(idx)}
              className="w-full flex items-center gap-2 py-1.5 group hover:bg-warning/10 rounded transition-colors my-0.5"
            >
              <div className="flex-1 h-px bg-warning/30 group-hover:bg-warning" />
              <Scissors className="h-3.5 w-3.5 text-warning/50 group-hover:text-warning transition-colors rotate-90" />
              <div className="flex-1 h-px bg-warning/30 group-hover:bg-warning" />
            </button>
          )}
          <div
            className="text-sm px-2 py-1 rounded"
            dangerouslySetInnerHTML={{ __html: p }}
          />
        </div>
      ))}
    </div>
  );
}

import { useState } from "react";
import { Card } from "@/lib/spaced-repetition";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, GripVertical } from "lucide-react";

interface SectionInput {
  title: string;
  content: string;
}

interface Props {
  categories: string[];
  onSave: (question: string, sections: SectionInput[], category: string) => void;
  onCancel: () => void;
  editCard?: Card | null;
  onUpdate?: (id: string, updates: { question?: string; sections?: SectionInput[]; category?: string }) => void;
}

export default function CardForm({ categories, onSave, onCancel, editCard, onUpdate }: Props) {
  const [question, setQuestion] = useState(editCard?.question ?? "");
  const [sections, setSections] = useState<SectionInput[]>(
    editCard?.sections.map((s) => ({ title: s.title, content: s.content })) ?? [
      { title: "Cjelina 1", content: "" },
    ]
  );
  const [category, setCategory] = useState(editCard?.category ?? categories[0] ?? "Opšte");
  const [newCategory, setNewCategory] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || sections.some((s) => !s.content.trim())) return;
    const cat = showNewCat && newCategory.trim() ? newCategory.trim() : category;
    if (editCard && onUpdate) {
      onUpdate(editCard.id, { question, sections, category: cat });
    } else {
      onSave(question, sections, cat);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-serif">{editCard ? "Uredi karticu" : "Nova kartica"}</h2>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Pitanje</label>
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Unesite esejsko pitanje..."
          className="min-h-[80px] resize-y bg-card"
        />
      </div>

      {/* Sections */}
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
              {sections.length > 1 && (
                <button type="button" onClick={() => removeSection(i)} className="text-muted-foreground hover:text-destructive p-1">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Textarea
              value={section.content}
              onChange={(e) => updateSection(i, "content", e.target.value)}
              placeholder="Sadržaj ove cjeline odgovora..."
              className="min-h-[100px] resize-y bg-background text-sm"
            />
          </div>
        ))}
      </div>

      {/* Category */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Kategorija</label>
        {!showNewCat ? (
          <div className="flex gap-2">
            <Select value={category} onValueChange={setCategory}>
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

      <Button type="submit" className="w-full">
        {editCard ? "Sačuvaj izmjene" : "Dodaj karticu"}
      </Button>
    </form>
  );
}

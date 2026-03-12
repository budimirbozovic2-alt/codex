import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload, ArrowRight } from "lucide-react";
import mammoth from "mammoth";

interface ParsedCard {
  question: string;
  sections: { title: string; content: string }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  categories: string[];
  onImport: (cards: ParsedCard[], category: string) => void;
}

type HeadingLevel = "h1" | "h2" | "h3";

const headingLabels: Record<HeadingLevel, string> = {
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
};

export default function DocxImporter({ open, onClose, categories, onImport }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [splitHeading, setSplitHeading] = useState<HeadingLevel>("h1");
  const [sectionHeading, setSectionHeading] = useState<HeadingLevel>("h2");
  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([]);
  const [category, setCategory] = useState(categories[0] ?? "Opšte");
  const [newCategory, setNewCategory] = useState("");
  const [step, setStep] = useState<"upload" | "configure" | "preview">("upload");

  const handleFileSelect = useCallback(async (f: File) => {
    setFile(f);
    try {
      const arrayBuffer = await f.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      setHtmlContent(result.value);
      setStep("configure");
    } catch {
      alert("Greška pri čitanju DOCX fajla.");
    }
  }, []);

  const parseContent = useCallback(() => {
    if (!htmlContent) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const elements = Array.from(doc.body.children);

    const cards: ParsedCard[] = [];
    let currentQuestion = "";
    let currentSections: { title: string; content: string }[] = [];
    let currentSectionTitle = "";
    let currentSectionContent = "";

    const flushSection = () => {
      if (currentSectionContent.trim()) {
        currentSections.push({
          title: currentSectionTitle || `Cjelina ${currentSections.length + 1}`,
          content: currentSectionContent.trim(),
        });
      }
      currentSectionTitle = "";
      currentSectionContent = "";
    };

    const flushCard = () => {
      flushSection();
      if (currentQuestion.trim() && currentSections.length > 0) {
        cards.push({ question: currentQuestion.trim(), sections: [...currentSections] });
      }
      currentQuestion = "";
      currentSections = [];
    };

    for (const el of elements) {
      const tag = el.tagName.toLowerCase();

      if (tag === splitHeading) {
        flushCard();
        currentQuestion = el.textContent?.trim() || "";
      } else if (tag === sectionHeading && currentQuestion) {
        flushSection();
        currentSectionTitle = el.textContent?.trim() || "";
      } else if (currentQuestion) {
        currentSectionContent += el.outerHTML + "\n";
      }
    }

    flushCard();
    setParsedCards(cards);
    setStep("preview");
  }, [htmlContent, splitHeading, sectionHeading]);

  const handleImport = () => {
    const cat = newCategory.trim() || category;
    onImport(parsedCards, cat);
    handleReset();
  };

  const handleReset = () => {
    setFile(null);
    setHtmlContent("");
    setParsedCards([]);
    setStep("upload");
    setNewCategory("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleReset()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Uvezi iz DOCX fajla</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-4">
            <label className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
              <FileText className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Odaberite DOCX fajl</p>
                <p className="text-sm text-muted-foreground mt-1">Kliknite ili prevucite fajl ovdje</p>
              </div>
              <input
                type="file"
                accept=".docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </label>
          </div>
        )}

        {step === "configure" && (
          <div className="space-y-6 py-4">
            <p className="text-sm text-muted-foreground">
              Fajl "<span className="font-medium text-foreground">{file?.name}</span>" je učitan. Odaberite kako da se podijeli na kartice.
            </p>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Pitanja se dijele po:</label>
                <Select value={splitHeading} onValueChange={(v) => setSplitHeading(v as HeadingLevel)}>
                  <SelectTrigger className="bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["h1", "h2", "h3"] as HeadingLevel[]).map((h) => (
                      <SelectItem key={h} value={h}>{headingLabels[h]} — svaki {headingLabels[h]} = novo pitanje</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Cjeline unutar pitanja se dijele po:</label>
                <Select value={sectionHeading} onValueChange={(v) => setSectionHeading(v as HeadingLevel)}>
                  <SelectTrigger className="bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["h1", "h2", "h3"] as HeadingLevel[]).map((h) => (
                      <SelectItem key={h} value={h} disabled={h === splitHeading}>{headingLabels[h]} — svaki {headingLabels[h]} = nova cjelina</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Kategorija</label>
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
                  <input
                    placeholder="Ili nova..."
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="flex h-10 rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-40"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("upload")} className="flex-1">Nazad</Button>
              <Button onClick={parseContent} className="flex-1">
                Pregledaj <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-6 py-4">
            <p className="text-sm text-muted-foreground">
              Pronađeno <span className="font-medium text-foreground">{parsedCards.length}</span> pitanja. Pregledajte prije uvoza.
            </p>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {parsedCards.map((card, i) => (
                <div key={i} className="rounded-xl border bg-card p-4 space-y-2">
                  <p className="font-medium text-sm">{card.question}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {card.sections.map((s, j) => (
                      <span key={j} className="px-2 py-0.5 rounded-md bg-secondary text-xs text-muted-foreground">
                        {s.title}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {parsedCards.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nisu pronađena pitanja. Provjerite postavke podjele.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("configure")} className="flex-1">Nazad</Button>
              <Button onClick={handleImport} className="flex-1" disabled={parsedCards.length === 0}>
                <Upload className="h-4 w-4 mr-2" /> Uvezi {parsedCards.length} pitanja
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

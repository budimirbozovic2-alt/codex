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
type SplitMode = "heading" | "delimiter";

const headingLabels: Record<HeadingLevel, string> = {
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
};

const splitModeLabels: Record<SplitMode, string> = {
  heading: "Po headingu",
  delimiter: "Po tekstu",
};

export default function DocxImporter({ open, onClose, categories, onImport }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [questionSplitMode, setQuestionSplitMode] = useState<SplitMode>("heading");
  const [sectionSplitMode, setSectionSplitMode] = useState<SplitMode>("heading");
  const [splitHeading, setSplitHeading] = useState<HeadingLevel>("h1");
  const [sectionHeading, setSectionHeading] = useState<HeadingLevel>("h2");
  const [delimiter, setDelimiter] = useState("");
  const [sectionDelimiter, setSectionDelimiter] = useState("");
  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([]);
  const [category, setCategory] = useState(categories[0] ?? "Opšte");
  const [newCategory, setNewCategory] = useState("");
  const [step, setStep] = useState<"upload" | "configure" | "preview">("upload");

  const handleFileSelect = useCallback(async (f: File) => {
    setFile(f);
    try {
      const arrayBuffer = await f.arrayBuffer();
      const result = await mammoth.convertToHtml({
        arrayBuffer,
      }, {
        styleMap: [
          "p[style-name='List Paragraph'] => p.list-paragraph:fresh",
        ],
      });
      setHtmlContent(result.value);
      setStep("configure");
    } catch {
      alert("Greška pri čitanju DOCX fajla.");
    }
  }, []);

  // Helper: split collected content into sections based on sectionSplitMode
  const splitIntoSections = useCallback((contentHtml: string): { title: string; content: string }[] => {
    if (!contentHtml.trim()) return [];

    const tempDoc = new DOMParser().parseFromString(contentHtml, "text/html");
    const elements = Array.from(tempDoc.body.children);
    const sections: { title: string; content: string }[] = [];
    let secTitle = "";
    let secContent = "";

    const flushSec = () => {
      if (secContent.trim()) {
        sections.push({
          title: secTitle || `Cjelina ${sections.length + 1}`,
          content: secContent.trim(),
        });
      }
      secTitle = "";
      secContent = "";
    };

    if (sectionSplitMode === "heading") {
      for (const el of elements) {
        const tag = el.tagName.toLowerCase();
        if (tag === sectionHeading) {
          flushSec();
          secTitle = el.textContent?.trim() || "";
        } else {
          secContent += el.outerHTML + "\n";
        }
      }
    } else {
      const secDelim = sectionDelimiter.trim();
      if (secDelim) {
        for (const el of elements) {
          const text = el.textContent?.trim() || "";
          if (text.startsWith(secDelim)) {
            flushSec();
            secTitle = text;
          } else {
            secContent += el.outerHTML + "\n";
          }
        }
      } else {
        // No delimiter specified — single section
        return [{ title: "Odgovor", content: contentHtml.trim() }];
      }
    }

    flushSec();
    return sections.length > 0 ? sections : [{ title: "Odgovor", content: contentHtml.trim() }];
  }, [sectionSplitMode, sectionHeading, sectionDelimiter]);

  const parseContent = useCallback(() => {
    if (!htmlContent) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const elements = Array.from(doc.body.children);
    const cards: ParsedCard[] = [];
    let currentQuestion = "";
    let currentContent = "";

    const flushCard = () => {
      if (currentQuestion.trim() && currentContent.trim()) {
        const sections = splitIntoSections(currentContent);
        if (sections.length > 0) {
          cards.push({ question: currentQuestion.trim(), sections });
        }
      }
      currentQuestion = "";
      currentContent = "";
    };

    if (questionSplitMode === "heading") {
      for (const el of elements) {
        const tag = el.tagName.toLowerCase();
        if (tag === splitHeading) {
          flushCard();
          currentQuestion = el.textContent?.trim() || "";
        } else if (currentQuestion) {
          currentContent += el.outerHTML + "\n";
        }
      }
    } else {
      const delim = delimiter.trim();
      if (!delim) return;
      for (const el of elements) {
        const text = el.textContent?.trim() || "";
        if (text.startsWith(delim)) {
          flushCard();
          currentQuestion = text;
        } else if (currentQuestion) {
          currentContent += el.outerHTML + "\n";
        }
      }
    }

    flushCard();
    setParsedCards(cards);
    setStep("preview");
  }, [htmlContent, questionSplitMode, splitHeading, delimiter, splitIntoSections]);

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
              {/* Question split mode */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Razdvajanje pitanja</label>
                <div className="flex gap-2">
                  {(["heading", "delimiter"] as SplitMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setQuestionSplitMode(m)}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${questionSplitMode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                    >
                      {splitModeLabels[m]}
                    </button>
                  ))}
                </div>
                {questionSplitMode === "heading" ? (
                  <Select value={splitHeading} onValueChange={(v) => setSplitHeading(v as HeadingLevel)}>
                    <SelectTrigger className="bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["h1", "h2", "h3"] as HeadingLevel[]).map((h) => (
                        <SelectItem key={h} value={h}>{headingLabels[h]} = novo pitanje</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-1">
                    <input
                      value={delimiter}
                      onChange={(e) => setDelimiter(e.target.value)}
                      placeholder='npr. "čl." ili "Pitanje:"'
                      className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground">Red koji počinje ovom oznakom postaje pitanje.</p>
                  </div>
                )}
              </div>

              {/* Section split mode */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Razdvajanje cjelina unutar pitanja</label>
                <div className="flex gap-2">
                  {(["heading", "delimiter"] as SplitMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSectionSplitMode(m)}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${sectionSplitMode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                    >
                      {splitModeLabels[m]}
                    </button>
                  ))}
                </div>
                {sectionSplitMode === "heading" ? (
                  <Select value={sectionHeading} onValueChange={(v) => setSectionHeading(v as HeadingLevel)}>
                    <SelectTrigger className="bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["h1", "h2", "h3"] as HeadingLevel[]).map((h) => (
                        <SelectItem key={h} value={h} disabled={questionSplitMode === "heading" && h === splitHeading}>
                          {headingLabels[h]} = nova cjelina
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-1">
                    <input
                      value={sectionDelimiter}
                      onChange={(e) => setSectionDelimiter(e.target.value)}
                      placeholder='npr. "Stav" ili opciono prazno'
                      className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground">Opciono. Ako ostavite prazno, cijeli odgovor je jedna cjelina.</p>
                  </div>
                )}
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

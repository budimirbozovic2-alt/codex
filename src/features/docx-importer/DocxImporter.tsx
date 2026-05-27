import { FileText, Upload, ArrowRight, Zap, BookOpen } from "lucide-react";
import { afterDialogClose } from "@/lib/dialog-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useDocxImportFlow,
  type CardType,
} from "./useDocxImportFlow";
import type {
  HeadingLevel,
  ParsedCard,
  SplitMode,
} from "@/lib/docx/splitIntoSections";

interface Props {
  open: boolean;
  onClose: () => void;
  categories: string[];
  onImport: (cards: ParsedCard[], category: string, cardType: CardType) => void;
}

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
  const flow = useDocxImportFlow(categories[0] ?? "");
  const { splitConfig, updateSplitConfig } = flow;

  const handleReset = () => {
    flow.reset();
    onClose();
  };

  const handleImport = () => {
    const cat = flow.newCategory.trim() || flow.category;
    const cards = flow.parsedCards;
    const type = flow.cardType;
    // Root-cause: zatvori dijalog PRVO; uvoz mijenja AppContext + IDB i
    // pokreće toast — sve to mora čekati Radix unmount cleanup.
    handleReset();
    afterDialogClose(() => onImport(cards, cat, type));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleReset()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold">Uvezi iz DOCX fajla</DialogTitle>
        </DialogHeader>

        {flow.step === "upload" && (
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
                  if (f) flow.handleFileSelect(f);
                }}
              />
            </label>
          </div>
        )}

        {flow.step === "configure" && (
          <div className="space-y-6 py-4">
            <p className="text-sm text-muted-foreground">
              Fajl "<span className="font-medium text-foreground">{flow.file?.name}</span>" je učitan. Odaberite kako da se podijeli na kartice.
            </p>

            <div className="space-y-4">
              {/* Card type */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Tip kartice</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => flow.setCardType("essay")}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${flow.cardType === "essay" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                  >
                    <BookOpen className="h-4 w-4" /> Esejska
                  </button>
                  <button
                    type="button"
                    onClick={() => flow.setCardType("flash")}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${flow.cardType === "flash" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                  >
                    <Zap className="h-4 w-4" /> Blic
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {flow.cardType === "essay" ? "Pitanja sa cjelinama — za duže odgovore" : "Kratka pitanja sa jednim odgovorom"}
                </p>
              </div>

              {/* Question split mode */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Razdvajanje pitanja</label>
                <div className="flex gap-2">
                  {(["heading", "delimiter"] as SplitMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => updateSplitConfig({ questionSplitMode: m })}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${splitConfig.questionSplitMode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                    >
                      {splitModeLabels[m]}
                    </button>
                  ))}
                </div>
                {splitConfig.questionSplitMode === "heading" ? (
                  <Select
                    value={splitConfig.splitHeading}
                    onValueChange={(v) => updateSplitConfig({ splitHeading: v as HeadingLevel })}
                  >
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
                      value={splitConfig.delimiter}
                      onChange={(e) => updateSplitConfig({ delimiter: e.target.value })}
                      placeholder='npr. "čl." ili "Pitanje:"'
                      className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground">Red koji počinje ovom oznakom postaje pitanje.</p>
                  </div>
                )}
              </div>

              {/* Section split mode — only for essay */}
              {flow.cardType === "essay" && (<div className="space-y-2">
                <label className="text-sm font-medium">Razdvajanje cjelina unutar pitanja</label>
                <div className="flex gap-2">
                  {(["heading", "delimiter"] as SplitMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => updateSplitConfig({ sectionSplitMode: m })}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${splitConfig.sectionSplitMode === m ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                    >
                      {splitModeLabels[m]}
                    </button>
                  ))}
                </div>
                {splitConfig.sectionSplitMode === "heading" ? (
                  <Select
                    value={splitConfig.sectionHeading}
                    onValueChange={(v) => updateSplitConfig({ sectionHeading: v as HeadingLevel })}
                  >
                    <SelectTrigger className="bg-card">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["h1", "h2", "h3"] as HeadingLevel[]).map((h) => (
                        <SelectItem
                          key={h}
                          value={h}
                          disabled={splitConfig.questionSplitMode === "heading" && h === splitConfig.splitHeading}
                        >
                          {headingLabels[h]} = nova cjelina
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-1">
                    <input
                      value={splitConfig.sectionDelimiter}
                      onChange={(e) => updateSplitConfig({ sectionDelimiter: e.target.value })}
                      placeholder='npr. "Stav" ili opciono prazno'
                      className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground">Opciono. Ako ostavite prazno, cijeli odgovor je jedna cjelina.</p>
                  </div>
                )}
              </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Kategorija</label>
                <div className="flex gap-2">
                  <Select value={flow.category} onValueChange={flow.setCategory}>
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
                    value={flow.newCategory}
                    onChange={(e) => flow.setNewCategory(e.target.value)}
                    className="flex h-10 rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-40"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => flow.setStep("upload")} className="flex-1">Nazad</Button>
              <Button onClick={flow.parseContent} className="flex-1">
                Pregledaj <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {flow.step === "preview" && (
          <div className="space-y-6 py-4">
            <p className="text-sm text-muted-foreground">
              Pronađeno <span className="font-medium text-foreground">{flow.parsedCards.length}</span> pitanja. Pregledajte prije uvoza.
            </p>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {flow.parsedCards.map((card, i) => (
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
              {flow.parsedCards.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nisu pronađena pitanja. Provjerite postavke podjele.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => flow.setStep("configure")} className="flex-1">Nazad</Button>
              <Button onClick={handleImport} className="flex-1" disabled={flow.parsedCards.length === 0}>
                <Upload className="h-4 w-4 mr-2" /> Uvezi {flow.parsedCards.length} pitanja
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

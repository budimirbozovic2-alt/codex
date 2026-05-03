import { useState, useCallback, useEffect, useMemo } from "react";
import { Upload, FileText, Bookmark, Save, Trash2, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { type Card } from "@/lib/spaced-repetition";
import { useDirtyDialog } from "@/hooks/useDirtyDialog";
import DirtyConfirmBar from "@/components/ui/dirty-confirm-bar";
import { parseFlashcards } from "@/lib/flashcard-parser";
import {
  listTemplates,
  saveTemplate,
  deleteTemplate,
  type FlashcardImportTemplate,
} from "@/lib/flashcard-import-templates";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoryId: string;
  /** Bulk path — single state update + single IDB transaction for all parsed pairs.
   *  Replaces legacy per-row addFlashCard loop which froze UI on >100 imports. */
  bulkAddFlashCards: (
    pairs: { question: string; answer: string }[],
    categoryId: string,
    subcategoryId?: string,
  ) => void;
}

interface ParsedPair { question: string; answer: string }

export default function BulkImportDialog({ open, onOpenChange, categoryId, bulkAddFlashCards }: Props) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedPair[] | null>(null);
  const [templates, setTemplates] = useState<FlashcardImportTemplate[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  // Refresh template list whenever the dialog opens.
  useEffect(() => {
    if (open) setTemplates(listTemplates());
  }, [open]);

  // P:/O: shape detector — controls visibility of the "Sačuvaj šablon" action.
  const looksLikePOFormat = useMemo(
    () =>
      /^[ \t]*[Pp][ \t]*:/m.test(raw) && /^[ \t]*[Oo][ \t]*:/m.test(raw),
    [raw],
  );

  const handleLoadTemplate = useCallback((tpl: FlashcardImportTemplate) => {
    setRaw(tpl.body);
    setParsed(null);
    toast.success(`Učitan šablon "${tpl.name}"`);
  }, []);

  const handleSaveTemplate = useCallback(() => {
    const rec = saveTemplate(saveName, raw);
    if (!rec) {
      toast.error("Nije moguće sačuvati", { description: "Naziv i tekst su obavezni." });
      return;
    }
    setTemplates(listTemplates());
    setSaveName("");
    setSaveOpen(false);
    toast.success(`Šablon "${rec.name}" sačuvan`);
  }, [saveName, raw]);

  const handleDeleteTemplate = useCallback((id: string, name: string) => {
    deleteTemplate(id);
    setTemplates(listTemplates());
    toast.message(`Obrisan šablon "${name}"`);
  }, []);


  const analyze = useCallback(() => {
    // Supported formats (auto-detected, in priority order):
    //   0) P:/O: prefix format — primary, supports multi-paragraph answers
    //   1) Single-line: Question;Answer
    //   2) Multi-line: blocks separated by blank lines, first line = question
    const trimmed = raw.trim();
    if (!trimmed) { setParsed([]); return; }

    // 0) P:/O: prefix detection — both markers must appear at line starts.
    if (/^[ \t]*[Pp][ \t]*:/m.test(trimmed) && /^[ \t]*[Oo][ \t]*:/m.test(trimmed)) {
      setParsed(parseFlashcards(trimmed));
      return;
    }

    // Detect format: if any line has `;`, use single-line mode
    const lines = trimmed.split("\n");
    const hasSemicolon = lines.some(l => l.includes(";") && l.indexOf(";") > 0);

    const pairs: ParsedPair[] = [];

    if (hasSemicolon) {
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        const idx = t.indexOf(";");
        if (idx < 1) continue;
        const question = t.slice(0, idx).trim();
        const answer = t.slice(idx + 1).trim();
        if (question && answer) pairs.push({ question, answer });
      }
    } else {
      // Multi-line mode: blank line separates Q/A blocks
      // First line of block = question, rest = answer
      const blocks = trimmed.split(/\n\s*\n/);
      for (const block of blocks) {
        const blockLines = block.trim().split("\n");
        if (blockLines.length < 2) continue;
        const question = blockLines[0].trim();
        const answer = blockLines.slice(1).map(l => l.trim()).join("\n");
        if (question && answer) pairs.push({ question, answer });
      }
    }
    setParsed(pairs);
  }, [raw]);

  const confirmImport = useCallback(() => {
    if (!parsed || parsed.length === 0) return;
    // Single batched commit: one setCardMapState + one IDB transaction.
    bulkAddFlashCards(parsed, categoryId);
    toast.success(`Uspješno uvezeno ${parsed.length} blic pitanja`);
    setRaw("");
    setParsed(null);
    onOpenChange(false);
  }, [parsed, categoryId, bulkAddFlashCards, onOpenChange]);

  const isDirty = raw.trim().length > 0 || (parsed?.length ?? 0) > 0;

  const performClose = useCallback(() => {
    setRaw("");
    setParsed(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const { pendingClose, requestClose, cancelClose, confirmDiscard } = useDirtyDialog(isDirty, performClose);

  const handleClose = (v: boolean) => {
    if (!v) { requestClose(); return; }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-lg"
        onPointerDownOutside={(e) => { if (isDirty) { e.preventDefault(); requestClose(); } }}
        onEscapeKeyDown={(e) => { if (isDirty) { e.preventDefault(); requestClose(); } }}
      >
        <DialogHeader>
          <DialogTitle className="imperial-title text-lg">Masovni import blic pitanja</DialogTitle>
        </DialogHeader>

        {!parsed ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              <strong>Preporučeno:</strong> redovi sa <code className="bg-muted px-1 rounded">P:</code> (pitanje) i <code className="bg-muted px-1 rounded">O:</code> (odgovor); odgovor može imati više pasusa.<br/>
              Alt 1: <code className="bg-muted px-1 rounded">Pitanje;Odgovor</code> — jedan par po redu.<br/>
              Alt 2: Pitanje u prvom redu, odgovor u sljedećim redovima, prazan red razdvaja parove.
            </p>

            {/* Templates toolbar — load any saved P:/O: boilerplate, or save the
                current textarea as a reusable template. Stored in localStorage. */}
            <div className="flex items-center gap-2 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={templates.length === 0}>
                    <Bookmark className="h-3.5 w-3.5" />
                    Šabloni
                    {templates.length > 0 && (
                      <span className="text-muted-foreground">({templates.length})</span>
                    )}
                    <ChevronDown className="h-3 w-3 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 max-h-72 overflow-y-auto">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Sačuvani šabloni
                  </DropdownMenuLabel>
                  {templates.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      Nema sačuvanih šablona.
                    </div>
                  ) : (
                    templates.map(tpl => (
                      <DropdownMenuItem
                        key={tpl.id}
                        onSelect={(e) => { e.preventDefault(); handleLoadTemplate(tpl); }}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="flex-1 truncate">{tpl.name}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl.id, tpl.name); }}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          aria-label={`Obriši šablon ${tpl.name}`}
                          title="Obriši šablon"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
                    Šabloni se čuvaju lokalno na ovom uređaju.
                  </p>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setSaveOpen(v => !v)}
                disabled={!looksLikePOFormat || !raw.trim()}
                title={
                  !raw.trim()
                    ? "Unesite tekst da biste sačuvali šablon"
                    : !looksLikePOFormat
                      ? "Šabloni su podržani samo za P:/O: format"
                      : "Sačuvaj trenutni unos kao šablon"
                }
              >
                <Save className="h-3.5 w-3.5" />
                {saveOpen ? "Otkaži" : "Sačuvaj kao šablon"}
              </Button>
            </div>

            {saveOpen && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
                <Input
                  autoFocus
                  value={saveName}
                  onChange={e => setSaveName(e.target.value)}
                  placeholder="Naziv šablona (npr. Obligaciono — sedmica 3)"
                  className="h-8 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && saveName.trim()) { e.preventDefault(); handleSaveTemplate(); }
                  }}
                />
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleSaveTemplate}
                  disabled={!saveName.trim()}
                >
                  Sačuvaj
                </Button>
              </div>
            )}

            <Textarea
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder={"P: Šta je ugovor?\nO: Saglasnost volja dviju strana o nastanku, izmjeni ili prestanku obligacionog odnosa.\n\nP: Šta je hipoteka?\nO: Založno pravo na nekretnini."}
              rows={12}
              className="font-mono text-xs"
            />
            <Button onClick={analyze} disabled={!raw.trim()} className="w-full gap-2">
              <FileText className="h-4 w-4" /> Analiziraj
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Pronađeno {parsed.length} blic pitanja</Badge>
            </div>

            {parsed.length > 0 && (
              <div className="rounded border bg-muted/30 p-3 space-y-1.5 max-h-48 overflow-y-auto">
                {parsed.slice(0, 5).map((p, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium text-foreground">{p.question}</span>
                    <span className="text-muted-foreground"> → {p.answer}</span>
                  </div>
                ))}
                {parsed.length > 5 && (
                  <p className="text-[10px] text-muted-foreground">...i još {parsed.length - 5}</p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setParsed(null)} className="flex-1">
                Nazad
              </Button>
              <Button onClick={confirmImport} disabled={parsed.length === 0} className="flex-1 gap-2">
                <Upload className="h-4 w-4" /> Uvezi {parsed.length} kartica
              </Button>
            </div>
          </div>
        )}

        <DirtyConfirmBar
          open={pendingClose}
          onCancel={cancelClose}
          onDiscard={confirmDiscard}
          onSave={async () => {
            if (parsed && parsed.length > 0) {
              confirmImport();
            } else {
              toast.message("Nema parsiranih pitanja", { description: "Kliknite Analiziraj prije snimanja." });
              cancelClose();
            }
          }}
          saveLabel={parsed && parsed.length > 0 ? `Uvezi ${parsed.length} i zatvori` : "Sačuvaj i zatvori"}
        />
      </DialogContent>
    </Dialog>
  );
}

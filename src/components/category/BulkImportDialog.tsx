import { useState, useCallback } from "react";
import { Upload, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { type Card } from "@/lib/spaced-repetition";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoryId: string;
  addFlashCard: (question: string, answer: string, category: string, subcategory?: string) => Card;
}

interface ParsedPair { question: string; answer: string }

export default function BulkImportDialog({ open, onOpenChange, categoryId, addFlashCard }: Props) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedPair[] | null>(null);

  const analyze = useCallback(() => {
    // Support two formats:
    // 1) Single-line: Question;Answer
    // 2) Multi-line: blocks separated by blank lines, first line = question, rest = answer
    const trimmed = raw.trim();
    if (!trimmed) { setParsed([]); return; }

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
    for (const p of parsed) {
      addFlashCard(p.question, p.answer, categoryId);
    }
    toast.success(`Uspješno uvezeno ${parsed.length} blic pitanja`);
    setRaw("");
    setParsed(null);
    onOpenChange(false);
  }, [parsed, categoryId, addFlashCard, onOpenChange]);

  const handleClose = (v: boolean) => {
    if (!v) { setParsed(null); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="imperial-title text-lg">Masovni import blic pitanja</DialogTitle>
        </DialogHeader>

        {!parsed ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Format 1: <code className="bg-muted px-1 rounded">Pitanje;Odgovor</code> — jedan par po redu.<br/>
              Format 2: Pitanje u prvom redu, odgovor u sljedećim redovima, prazan red razdvaja parove.
            </p>
            <Textarea
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder={"Šta je ugovor?;Saglasnost volja dviju strana\nŠta je hipoteka?;Založno pravo na nekretnini"}
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
      </DialogContent>
    </Dialog>
  );
}

import { Plus, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EXAMINER_CHECKLIST_MAX_ITEMS, EXAMINER_CHECKLIST_PRESETS } from "@/lib/examiner-profile-presets";
import { useExaminerProfileEditor, NONE, NOTES_MAX } from "./useExaminerProfileEditor";

interface FieldsProps {
  editor: ReturnType<typeof useExaminerProfileEditor>;
}

export function ExaminerProfileFields({ editor }: FieldsProps) {
  const {
    difficulty,
    setDifficulty,
    answerType,
    setAnswerType,
    checklist,
    newItem,
    setNewItem,
    notes,
    setNotes,
    addItem,
    removeItem,
    atMax,
    checklistKeys,
  } = editor;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ep-difficulty">Težina ispitivača</Label>
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger id="ep-difficulty">
            <SelectValue placeholder="Nije označeno" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Nije označeno</SelectItem>
            <SelectItem value="tezak">Težak</SelectItem>
            <SelectItem value="lak">Lak</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ep-answer">Preferirani tip odgovora</Label>
        <Select value={answerType} onValueChange={setAnswerType}>
          <SelectTrigger id="ep-answer">
            <SelectValue placeholder="Nije označeno" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Nije označeno</SelectItem>
            <SelectItem value="esej">Esej</SelectItem>
            <SelectItem value="definicija">Definicija</SelectItem>
            <SelectItem value="potpitanja">Potpitanja</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Očekivani elementi odgovora</Label>
          <span className="text-xs text-muted-foreground">
            {checklist.length}/{EXAMINER_CHECKLIST_MAX_ITEMS}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Rubrika za strukturisan odgovor. Utječe na adaptivno planiranje i pokrivenost ključnih dijelova kartice.
        </p>

        {checklist.length > 0 && (
          <ul className="space-y-1.5 rounded-lg border bg-muted/30 p-2">
            {checklist.map((item, i) => (
              <li key={`${item}-${i}`} className="flex items-start gap-2 text-sm">
                <span className="flex-1 leading-snug">{item}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeItem(i)}
                  aria-label={`Ukloni ${item}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem(newItem);
              }
            }}
            placeholder="npr. Subjektivni element"
            disabled={atMax}
            className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            aria-label="Novi element rubrike"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1"
            disabled={atMax || !newItem.trim()}
            onClick={() => addItem(newItem)}
          >
            <Plus className="h-3.5 w-3.5" />
            Dodaj
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {EXAMINER_CHECKLIST_PRESETS.filter((p) => !checklistKeys.has(p.toLowerCase())).map((preset) => (
            <Badge
              key={preset}
              variant="outline"
              className="cursor-pointer text-[11px] font-normal hover:bg-accent"
              onClick={() => { if (!atMax) addItem(preset); }}
            >
              + {preset}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ep-notes">Napomena (opcionalno)</Label>
        <Textarea
          id="ep-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
          placeholder="Specifičnosti ispitivanja, omiljene teme, stil pitanja…"
          rows={3}
        />
        <p className="text-xs text-muted-foreground text-right">{notes.length}/{NOTES_MAX}</p>
      </div>
    </div>
  );
}

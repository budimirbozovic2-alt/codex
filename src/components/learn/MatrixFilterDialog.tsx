import { useMemo, useState, useEffect } from "react";
import { Card } from "@/lib/spaced-repetition";
import { FREQUENCY_TAGS } from "@/lib/sr/format";
import type { FrequencyTag } from "@/lib/sr/types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Brain } from "lucide-react";

export interface MatrixFilters {
  subcategoryId: string | null;
  type: "all" | "essay" | "flash";
  frequencyTag: "all" | FrequencyTag;
  sortMode: "order" | "weakest";
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categoryName: string;
  cards: Card[];
  subcategories: { id: string; name: string }[];
  onStart: (filters: MatrixFilters) => void;
}

const DEFAULT_FILTERS: MatrixFilters = {
  subcategoryId: null,
  type: "all",
  frequencyTag: "all",
  sortMode: "order",
};

export default function MatrixFilterDialog({
  open, onOpenChange, categoryName, cards, subcategories, onStart,
}: Props) {
  const [filters, setFilters] = useState<MatrixFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    if (open) setFilters(DEFAULT_FILTERS);
  }, [open]);

  const matchedCount = useMemo(() => {
    let f = cards;
    if (filters.subcategoryId) f = f.filter(c => c.subcategoryId === filters.subcategoryId);
    if (filters.type === "essay") f = f.filter(c => c.type === "essay");
    else if (filters.type === "flash") f = f.filter(c => c.type === "flash");
    if (filters.frequencyTag !== "all") f = f.filter(c => c.frequencyTag === filters.frequencyTag);
    return f.length;
  }, [cards, filters]);

  const handleStart = () => {
    onStart(filters);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Matrični Filter
          </DialogTitle>
          <DialogDescription>
            Aktivno prisjećanje — {categoryName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground tracking-wider">Oblast</Label>
            <Select
              value={filters.subcategoryId ?? "all"}
              onValueChange={(v) => setFilters(f => ({ ...f, subcategoryId: v === "all" ? null : v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Sve potkategorije</SelectItem>
                {subcategories.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground tracking-wider">Tip</Label>
            <Select
              value={filters.type}
              onValueChange={(v) => setFilters(f => ({ ...f, type: v as MatrixFilters["type"] }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Sve</SelectItem>
                <SelectItem value="essay">Esejska</SelectItem>
                <SelectItem value="flash">Blic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground tracking-wider">Frekvencija</Label>
            <Select
              value={filters.frequencyTag}
              onValueChange={(v) => setFilters(f => ({ ...f, frequencyTag: v as MatrixFilters["frequencyTag"] }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Sve</SelectItem>
                {FREQUENCY_TAGS.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground tracking-wider">Sortiranje</Label>
            <Select
              value={filters.sortMode}
              onValueChange={(v) => setFilters(f => ({ ...f, sortMode: v as MatrixFilters["sortMode"] }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="order">Hronološki</SelectItem>
                <SelectItem value="weakest">Po težini (najslabija prvo)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg bg-secondary/50 p-3 text-center">
            <p className="text-xs text-muted-foreground">Pogađa</p>
            <p className="text-2xl font-bold text-foreground">{matchedCount}</p>
            <p className="text-xs text-muted-foreground">kartica</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Otkaži</Button>
          <Button onClick={handleStart} disabled={matchedCount === 0}>
            <Brain className="h-4 w-4 mr-2" /> Započni
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

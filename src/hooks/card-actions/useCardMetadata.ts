import { useState, useEffect, useMemo } from "react";
import type { CategoryRecord, SubcategoryNode } from "@/lib/db";
import type { Card, FrequencyTag, CardSourceType } from "@/lib/spaced-repetition";
import type { FormWidth } from "./validation";

interface Props {
  categories: string[];
  categoryRecords?: CategoryRecord[];
  editCard?: Card | null;
}

export function useCardMetadata({ categories, categoryRecords, editCard }: Props) {
  const [categoryId, setCategoryId] = useState(editCard?.categoryId ?? categories[0] ?? "");
  const [subcategoryId, setSubcategoryId] = useState(editCard?.subcategoryId ?? "");
  const [chapterId, setChapterId] = useState(editCard?.chapterId ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [newSubcategory, setNewSubcategory] = useState("");
  const [showNewSub, setShowNewSub] = useState(false);
  const [newChapter, setNewChapter] = useState("");
  const [showNewChapter, setShowNewChapter] = useState(false);
  const [formWidth, setFormWidth] = useState<FormWidth>("wide");
  const [frequencyTag, setFrequencyTag] = useState<FrequencyTag | "">(editCard?.frequencyTag ?? "");
  const [sourceType, setSourceType] = useState<CardSourceType | "">(editCard?.sourceType ?? "");

  const availableSubs: { id: string; name: string }[] = useMemo(() => {
    const catRec = categoryRecords?.find(r => r.id === categoryId);
    if (!catRec) return [];
    return (catRec.subcategories || []).map((n: SubcategoryNode | string) =>
      typeof n === "string" ? { id: n, name: n } : { id: n.id, name: n.name }
    );
  }, [categoryId, categoryRecords]);

  const [linkedGazetteInfo, setLinkedGazetteInfo] = useState<string | null>(null);
  useEffect(() => {
    if (!editCard?.sourceId) { setLinkedGazetteInfo(null); return; }
    import("@/lib/db").then(({ db }) => {
      db.sources.get(editCard.sourceId!).then(source => {
        setLinkedGazetteInfo(source?.officialGazetteInfo ?? null);
      });
    });
  }, [editCard?.sourceId]);

  // See original useCardActions for full rationale on legacy-string defensive skips.
  const availableChapters = useMemo((): { id: string; name: string }[] => {
    const sub = showNewSub && newSubcategory.trim() ? newSubcategory.trim() : subcategoryId;
    const cat = showNewCat && newCategory.trim() ? newCategory.trim() : categoryId;
    if (!sub || !cat || !categoryRecords) return [];
    const catRec = categoryRecords.find(r => r.id === cat);
    if (!catRec) return [];
    const rawNodes = (catRec.subcategories as unknown[]) || [];
    const nodes: SubcategoryNode[] = [];
    for (const s of rawNodes) {
      if (typeof s === "string") {
        if (import.meta.env.DEV) console.warn("[useCardMetadata] legacy string subcategory:", s);
        continue;
      }
      nodes.push(s as SubcategoryNode);
    }
    const node = nodes.find(n => n.id === sub);
    if (!node) return [];
    const result: { id: string; name: string }[] = [];
    for (const ch of (node.chapters || []) as unknown[]) {
      if (typeof ch === "string") {
        if (import.meta.env.DEV) console.warn("[useCardMetadata] legacy string chapter:", ch);
        continue;
      }
      const c = ch as { id: string; name: string };
      if (c.id && c.name) result.push({ id: c.id, name: c.name });
    }
    return result;
  }, [categoryId, subcategoryId, showNewCat, newCategory, showNewSub, newSubcategory, categoryRecords]);

  const resolvedMeta = useMemo(() => ({
    categoryId: showNewCat && newCategory.trim() ? newCategory.trim() : categoryId,
    subcategoryId: showNewSub && newSubcategory.trim() ? newSubcategory.trim() : subcategoryId,
    chapterId: showNewChapter && newChapter.trim() ? newChapter.trim() : chapterId,
  }), [showNewCat, newCategory, categoryId, showNewSub, newSubcategory, subcategoryId, showNewChapter, newChapter, chapterId]);

  return {
    categoryId, subcategoryId, chapterId,
    newCategory, showNewCat, newSubcategory, showNewSub, newChapter, showNewChapter,
    formWidth, frequencyTag, sourceType,
    availableSubs, availableChapters, linkedGazetteInfo, resolvedMeta,
    setCategoryId, setSubcategoryId, setChapterId,
    setNewCategory, setShowNewCat, setNewSubcategory, setShowNewSub,
    setNewChapter, setShowNewChapter, setFormWidth,
    setFrequencyTag, setSourceType,
  };
}

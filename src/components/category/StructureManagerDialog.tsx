import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Plus, ChevronDown, ChevronRight, Edit2, Trash2, Check, X,
  ArrowUp, ArrowDown, FolderOpen, BookOpen, AlertTriangle,
} from "lucide-react";
import type { SubcategoryNode, ChapterNode } from "@/lib/db-types";
import { stableLegacyId } from "@/lib/stable-id";

interface StructureManagerDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoryId: string;
  categoryName: string;
  subcategoryNodes: SubcategoryNode[];
  onAddSubcategory: (catId: string, name: string) => void;
  onRenameSubcategory: (catId: string, subcategoryId: string, newName: string) => void;
  onDeleteSubcategory: (catId: string, subcategoryId: string) => void;
  onReorderSubcategories: (catId: string, orderedIds: string[]) => void;
  onAddChapter: (catId: string, subcategoryId: string, chapterName: string) => void;
  onRenameChapter: (catId: string, subcategoryId: string, chapterId: string, newChapter: string) => void;
  onDeleteChapter: (catId: string, subcategoryId: string, chapterId: string) => void;
  onReorderChapters: (catId: string, subcategoryId: string, orderedIds: string[]) => void;
}

export default function StructureManagerDialog({
  open, onOpenChange, categoryId, categoryName, subcategoryNodes,
  onAddSubcategory, onRenameSubcategory, onDeleteSubcategory, onReorderSubcategories,
  onAddChapter, onRenameChapter, onDeleteChapter, onReorderChapters,
}: StructureManagerDialogProps) {
  const [newSubName, setNewSubName] = useState("");
  // editingSub now stores the UUID of the subcategory being edited
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const [editSubValue, setEditSubValue] = useState("");
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [newChapterName, setNewChapterName] = useState("");
  // addingChapterFor stores the UUID of the subcategory
  const [addingChapterFor, setAddingChapterFor] = useState<string | null>(null);
  // editingChapter stores UUIDs
  const [editingChapter, setEditingChapter] = useState<{ subId: string; chId: string } | null>(null);
  const [editChapterValue, setEditChapterValue] = useState("");
  // deleteConfirm stores UUIDs + display names for the confirmation message
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "sub" | "chapter";
    subId: string;
    subName: string;
    chId?: string;
    chName?: string;
  } | null>(null);

  const sorted = [...subcategoryNodes].sort((a, b) => a.sortOrder - b.sortOrder);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedSubs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleAddSub = useCallback(() => {
    const name = newSubName.trim();
    if (!name) return;
    if (sorted.some(s => s.name === name)) return;
    onAddSubcategory(categoryId, name);
    setNewSubName("");
  }, [newSubName, categoryId, onAddSubcategory, sorted]);

  const handleRenameSub = useCallback((subId: string) => {
    const newName = editSubValue.trim();
    if (!newName || newName === sorted.find(s => s.id === subId)?.name) {
      setEditingSub(null);
      return;
    }
    onRenameSubcategory(categoryId, subId, newName);
    setEditingSub(null);
  }, [editSubValue, categoryId, onRenameSubcategory, sorted]);

  const confirmDeleteSub = useCallback((subId: string, subName: string) => {
    setDeleteConfirm({ type: "sub", subId, subName });
  }, []);

  const confirmDeleteChapter = useCallback((subId: string, subName: string, chId: string, chName: string) => {
    setDeleteConfirm({ type: "chapter", subId, subName, chId, chName });
  }, []);

  const executeDelete = useCallback(() => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "sub") {
      onDeleteSubcategory(categoryId, deleteConfirm.subId);
    } else if (deleteConfirm.chId) {
      onDeleteChapter(categoryId, deleteConfirm.subId, deleteConfirm.chId);
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, categoryId, onDeleteSubcategory, onDeleteChapter]);

  const handleMoveSub = useCallback((index: number, dir: -1 | 1) => {
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    const reordered = [...sorted];
    const [item] = reordered.splice(index, 1);
    reordered.splice(newIdx, 0, item);
    onReorderSubcategories(categoryId, reordered.map(s => s.id));
  }, [sorted, categoryId, onReorderSubcategories]);

  const handleAddChapter = useCallback((subId: string) => {
    const name = newChapterName.trim();
    if (!name) return;
    const node = sorted.find(s => s.id === subId);
    if (node?.chapters.some(ch => ch.name === name)) return;
    onAddChapter(categoryId, subId, name);
    setNewChapterName("");
    setAddingChapterFor(null);
  }, [newChapterName, categoryId, onAddChapter, sorted]);

  const handleRenameChapter = useCallback((subId: string, chId: string) => {
    const newName = editChapterValue.trim();
    if (!newName) { setEditingChapter(null); return; }
    onRenameChapter(categoryId, subId, chId, newName);
    setEditingChapter(null);
  }, [editChapterValue, categoryId, onRenameChapter]);

  const handleMoveChapter = useCallback((subId: string, chapters: ChapterNode[], index: number, dir: -1 | 1) => {
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= chapters.length) return;
    const reordered = [...chapters];
    const [item] = reordered.splice(index, 1);
    reordered.splice(newIdx, 0, item);
    onReorderChapters(categoryId, subId, reordered.map(ch => ch.id));
  }, [categoryId, onReorderChapters]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Struktura — {categoryName}
          </DialogTitle>
        </DialogHeader>

        {/* Delete confirmation overlay */}
        {deleteConfirm && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {deleteConfirm.type === "sub"
                    ? `Obrisati potkategoriju "${deleteConfirm.subName}"?`
                    : `Obrisati glavu "${deleteConfirm.chName}"?`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Sve povezane kartice će biti premještene u Neraspoređene.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>Otkaži</Button>
              <Button variant="destructive" size="sm" onClick={executeDelete}>Obriši</Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {sorted.map((node, idx) => {
            const isExpanded = expandedSubs.has(node.id);
            // Stable id for legacy string chapters: deterministic per (subId, name)
            // so React keys never thrash across renders. Real persisted chapters
            // already have their own UUID — we never overwrite those.
            const chapters: ChapterNode[] = (node.chapters || []).map((ch: unknown, ci: number) =>
              typeof ch === "string"
                ? { id: stableLegacyId(node.id, ch), name: ch, sortOrder: ci }
                : (ch as ChapterNode)
            );
            return (
              <Collapsible key={node.id} open={isExpanded} onOpenChange={() => toggleExpanded(node.id)}>
                <div className="rounded-lg border bg-card overflow-hidden">
                  {/* Subcategory header */}
                  <div className="flex items-center gap-1.5 px-3 py-2">
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-1.5 flex-1 text-left min-w-0">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        {editingSub === node.id ? (
                          <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                            <Input value={editSubValue} onChange={e => setEditSubValue(e.target.value)}
                              className="h-6 text-xs flex-1" autoFocus
                              onKeyDown={e => { if (e.key === "Enter") handleRenameSub(node.id); if (e.key === "Escape") setEditingSub(null); }} />
                            <button onClick={() => handleRenameSub(node.id)} className="p-0.5 rounded hover:bg-secondary text-success"><Check className="h-3 w-3" /></button>
                            <button onClick={() => setEditingSub(null)} className="p-0.5 rounded hover:bg-secondary text-muted-foreground"><X className="h-3 w-3" /></button>
                          </div>
                        ) : (
                          <span className="text-sm font-medium text-foreground truncate">{node.name}</span>
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <Badge variant="secondary" className="text-[9px] h-4 px-1">{chapters.length} gl.</Badge>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => handleMoveSub(idx, -1)} disabled={idx === 0}
                        className="p-0.5 rounded hover:bg-secondary disabled:opacity-20"><ArrowUp className="h-3 w-3 text-muted-foreground" /></button>
                      <button onClick={() => handleMoveSub(idx, 1)} disabled={idx === sorted.length - 1}
                        className="p-0.5 rounded hover:bg-secondary disabled:opacity-20"><ArrowDown className="h-3 w-3 text-muted-foreground" /></button>
                      <button onClick={() => { setEditingSub(node.id); setEditSubValue(node.name); }}
                        className="p-0.5 rounded hover:bg-secondary"><Edit2 className="h-3 w-3 text-muted-foreground" /></button>
                      <button onClick={() => confirmDeleteSub(node.id, node.name)}
                        className="p-0.5 rounded hover:bg-destructive/10"><Trash2 className="h-3 w-3 text-destructive" /></button>
                    </div>
                  </div>

                  <CollapsibleContent>
                    <div className="border-t px-3 py-2 space-y-1.5 bg-muted/20">
                      {chapters.map((ch, chIdx) => (
                        <div key={ch.id} className="flex items-center gap-1.5 group">
                          <BookOpen className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                          {editingChapter?.subId === node.id && editingChapter?.chId === ch.id ? (
                            <div className="flex items-center gap-1 flex-1">
                              <Input value={editChapterValue} onChange={e => setEditChapterValue(e.target.value)}
                                className="h-6 text-xs flex-1" autoFocus
                                onKeyDown={e => { if (e.key === "Enter") handleRenameChapter(node.id, ch.id); if (e.key === "Escape") setEditingChapter(null); }} />
                              <button onClick={() => handleRenameChapter(node.id, ch.id)} className="p-0.5 rounded hover:bg-secondary text-success"><Check className="h-3 w-3" /></button>
                              <button onClick={() => setEditingChapter(null)} className="p-0.5 rounded hover:bg-secondary text-muted-foreground"><X className="h-3 w-3" /></button>
                            </div>
                          ) : (
                            <>
                              <span className="text-xs text-foreground flex-1 truncate">{ch.name}</span>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleMoveChapter(node.id, chapters, chIdx, -1)} disabled={chIdx === 0}
                                  className="p-0.5 rounded hover:bg-secondary disabled:opacity-20"><ArrowUp className="h-2.5 w-2.5 text-muted-foreground" /></button>
                                <button onClick={() => handleMoveChapter(node.id, chapters, chIdx, 1)} disabled={chIdx === chapters.length - 1}
                                  className="p-0.5 rounded hover:bg-secondary disabled:opacity-20"><ArrowDown className="h-2.5 w-2.5 text-muted-foreground" /></button>
                                <button onClick={() => { setEditingChapter({ subId: node.id, chId: ch.id }); setEditChapterValue(ch.name); }}
                                  className="p-0.5 rounded hover:bg-secondary"><Edit2 className="h-2.5 w-2.5 text-muted-foreground" /></button>
                                <button onClick={() => confirmDeleteChapter(node.id, node.name, ch.id, ch.name)}
                                  className="p-0.5 rounded hover:bg-destructive/10"><Trash2 className="h-2.5 w-2.5 text-destructive" /></button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}

                      {/* Add chapter */}
                      {addingChapterFor === node.id ? (
                        <div className="flex items-center gap-1.5">
                          <Input value={newChapterName} onChange={e => setNewChapterName(e.target.value)}
                            placeholder="Naziv glave..." className="h-6 text-xs flex-1" autoFocus
                            onKeyDown={e => { if (e.key === "Enter") handleAddChapter(node.id); if (e.key === "Escape") setAddingChapterFor(null); }} />
                          <Button size="sm" variant="secondary" className="h-6 text-[10px] px-2" onClick={() => handleAddChapter(node.id)}>Dodaj</Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="text-[10px] gap-1 text-muted-foreground h-6 px-1"
                          onClick={() => { setAddingChapterFor(node.id); setNewChapterName(""); }}>
                          <Plus className="h-3 w-3" /> Dodaj glavu
                        </Button>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}

          {/* Add subcategory */}
          <div className="flex items-center gap-2 pt-2">
            <Input value={newSubName} onChange={e => setNewSubName(e.target.value)}
              placeholder="Nova potkategorija..." className="h-8 text-xs flex-1"
              onKeyDown={e => { if (e.key === "Enter") handleAddSub(); }} />
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={handleAddSub} disabled={!newSubName.trim()}>
              <Plus className="h-3 w-3" /> Dodaj
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

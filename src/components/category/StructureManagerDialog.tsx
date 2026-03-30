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
import type { SubcategoryNode } from "@/lib/db";
import { cn } from "@/lib/utils";

interface StructureManagerDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoryId: string;
  categoryName: string;
  subcategoryNodes: SubcategoryNode[];
  onAddSubcategory: (catId: string, name: string) => void;
  onRenameSubcategory: (catId: string, oldName: string, newName: string) => void;
  onDeleteSubcategory: (catId: string, name: string) => void;
  onReorderSubcategories: (catId: string, ordered: string[]) => void;
  onAddChapter: (catId: string, subName: string, chapterName: string) => void;
  onRenameChapter: (catId: string, subName: string, oldChapter: string, newChapter: string) => void;
  onDeleteChapter: (catId: string, subName: string, chapterName: string) => void;
  onReorderChapters: (catId: string, subName: string, ordered: string[]) => void;
}

export default function StructureManagerDialog({
  open, onOpenChange, categoryId, categoryName, subcategoryNodes,
  onAddSubcategory, onRenameSubcategory, onDeleteSubcategory, onReorderSubcategories,
  onAddChapter, onRenameChapter, onDeleteChapter, onReorderChapters,
}: StructureManagerDialogProps) {
  const [newSubName, setNewSubName] = useState("");
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const [editSubValue, setEditSubValue] = useState("");
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [newChapterName, setNewChapterName] = useState("");
  const [addingChapterFor, setAddingChapterFor] = useState<string | null>(null);
  const [editingChapter, setEditingChapter] = useState<{ sub: string; ch: string } | null>(null);
  const [editChapterValue, setEditChapterValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "sub" | "chapter"; sub: string; ch?: string } | null>(null);

  const sorted = [...subcategoryNodes].sort((a, b) => a.sortOrder - b.sortOrder);

  const toggleExpanded = useCallback((name: string) => {
    setExpandedSubs(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
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

  const handleRenameSub = useCallback((oldName: string) => {
    const newName = editSubValue.trim();
    if (!newName || newName === oldName) { setEditingSub(null); return; }
    onRenameSubcategory(categoryId, oldName, newName);
    setEditingSub(null);
  }, [editSubValue, categoryId, onRenameSubcategory]);

  const confirmDeleteSub = useCallback((subName: string) => {
    setDeleteConfirm({ type: "sub", sub: subName });
  }, []);

  const confirmDeleteChapter = useCallback((subName: string, chName: string) => {
    setDeleteConfirm({ type: "chapter", sub: subName, ch: chName });
  }, []);

  const executeDelete = useCallback(() => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "sub") {
      onDeleteSubcategory(categoryId, deleteConfirm.sub);
    } else if (deleteConfirm.ch) {
      onDeleteChapter(categoryId, deleteConfirm.sub, deleteConfirm.ch);
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, categoryId, onDeleteSubcategory, onDeleteChapter]);

  const handleMoveSub = useCallback((index: number, dir: -1 | 1) => {
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    const reordered = [...sorted];
    const [item] = reordered.splice(index, 1);
    reordered.splice(newIdx, 0, item);
    onReorderSubcategories(categoryId, reordered.map(s => s.name));
  }, [sorted, categoryId, onReorderSubcategories]);

  const handleAddChapter = useCallback((subName: string) => {
    const name = newChapterName.trim();
    if (!name) return;
    const node = sorted.find(s => s.name === subName);
    if (node?.chapters.includes(name)) return;
    onAddChapter(categoryId, subName, name);
    setNewChapterName("");
    setAddingChapterFor(null);
  }, [newChapterName, categoryId, onAddChapter, sorted]);

  const handleRenameChapter = useCallback((subName: string, oldCh: string) => {
    const newName = editChapterValue.trim();
    if (!newName || newName === oldCh) { setEditingChapter(null); return; }
    onRenameChapter(categoryId, subName, oldCh, newName);
    setEditingChapter(null);
  }, [editChapterValue, categoryId, onRenameChapter]);

  const handleMoveChapter = useCallback((subName: string, chapters: string[], index: number, dir: -1 | 1) => {
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= chapters.length) return;
    const reordered = [...chapters];
    const [item] = reordered.splice(index, 1);
    reordered.splice(newIdx, 0, item);
    onReorderChapters(categoryId, subName, reordered);
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
                    ? `Obrisati potkategoriju "${deleteConfirm.sub}"?`
                    : `Obrisati glavu "${deleteConfirm.ch}"?`}
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
            const isExpanded = expandedSubs.has(node.name);
            return (
              <Collapsible key={node.name} open={isExpanded} onOpenChange={() => toggleExpanded(node.name)}>
                <div className="rounded-lg border bg-card overflow-hidden">
                  {/* Subcategory header */}
                  <div className="flex items-center gap-1.5 px-3 py-2">
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-1.5 flex-1 text-left min-w-0">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        {editingSub === node.name ? (
                          <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                            <Input value={editSubValue} onChange={e => setEditSubValue(e.target.value)}
                              className="h-6 text-xs flex-1" autoFocus
                              onKeyDown={e => { if (e.key === "Enter") handleRenameSub(node.name); if (e.key === "Escape") setEditingSub(null); }} />
                            <button onClick={() => handleRenameSub(node.name)} className="p-0.5 rounded hover:bg-secondary text-green-500"><Check className="h-3 w-3" /></button>
                            <button onClick={() => setEditingSub(null)} className="p-0.5 rounded hover:bg-secondary text-muted-foreground"><X className="h-3 w-3" /></button>
                          </div>
                        ) : (
                          <span className="text-sm font-medium text-foreground truncate">{node.name}</span>
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <Badge variant="secondary" className="text-[9px] h-4 px-1">{node.chapters.length} gl.</Badge>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => handleMoveSub(idx, -1)} disabled={idx === 0}
                        className="p-0.5 rounded hover:bg-secondary disabled:opacity-20"><ArrowUp className="h-3 w-3 text-muted-foreground" /></button>
                      <button onClick={() => handleMoveSub(idx, 1)} disabled={idx === sorted.length - 1}
                        className="p-0.5 rounded hover:bg-secondary disabled:opacity-20"><ArrowDown className="h-3 w-3 text-muted-foreground" /></button>
                      <button onClick={() => { setEditingSub(node.name); setEditSubValue(node.name); }}
                        className="p-0.5 rounded hover:bg-secondary"><Edit2 className="h-3 w-3 text-muted-foreground" /></button>
                      <button onClick={() => confirmDeleteSub(node.name)}
                        className="p-0.5 rounded hover:bg-destructive/10"><Trash2 className="h-3 w-3 text-destructive" /></button>
                    </div>
                  </div>

                  <CollapsibleContent>
                    <div className="border-t px-3 py-2 space-y-1.5 bg-muted/20">
                      {node.chapters.map((ch, chIdx) => (
                        <div key={ch} className="flex items-center gap-1.5 group">
                          <BookOpen className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                          {editingChapter?.sub === node.name && editingChapter?.ch === ch ? (
                            <div className="flex items-center gap-1 flex-1">
                              <Input value={editChapterValue} onChange={e => setEditChapterValue(e.target.value)}
                                className="h-6 text-xs flex-1" autoFocus
                                onKeyDown={e => { if (e.key === "Enter") handleRenameChapter(node.name, ch); if (e.key === "Escape") setEditingChapter(null); }} />
                              <button onClick={() => handleRenameChapter(node.name, ch)} className="p-0.5 rounded hover:bg-secondary text-green-500"><Check className="h-3 w-3" /></button>
                              <button onClick={() => setEditingChapter(null)} className="p-0.5 rounded hover:bg-secondary text-muted-foreground"><X className="h-3 w-3" /></button>
                            </div>
                          ) : (
                            <>
                              <span className="text-xs text-foreground flex-1 truncate">{ch}</span>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleMoveChapter(node.name, node.chapters, chIdx, -1)} disabled={chIdx === 0}
                                  className="p-0.5 rounded hover:bg-secondary disabled:opacity-20"><ArrowUp className="h-2.5 w-2.5 text-muted-foreground" /></button>
                                <button onClick={() => handleMoveChapter(node.name, node.chapters, chIdx, 1)} disabled={chIdx === node.chapters.length - 1}
                                  className="p-0.5 rounded hover:bg-secondary disabled:opacity-20"><ArrowDown className="h-2.5 w-2.5 text-muted-foreground" /></button>
                                <button onClick={() => { setEditingChapter({ sub: node.name, ch }); setEditChapterValue(ch); }}
                                  className="p-0.5 rounded hover:bg-secondary"><Edit2 className="h-2.5 w-2.5 text-muted-foreground" /></button>
                                <button onClick={() => confirmDeleteChapter(node.name, ch)}
                                  className="p-0.5 rounded hover:bg-destructive/10"><Trash2 className="h-2.5 w-2.5 text-destructive" /></button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}

                      {/* Add chapter */}
                      {addingChapterFor === node.name ? (
                        <div className="flex items-center gap-1.5">
                          <Input value={newChapterName} onChange={e => setNewChapterName(e.target.value)}
                            placeholder="Naziv glave..." className="h-6 text-xs flex-1" autoFocus
                            onKeyDown={e => { if (e.key === "Enter") handleAddChapter(node.name); if (e.key === "Escape") setAddingChapterFor(null); }} />
                          <Button size="sm" variant="secondary" className="h-6 text-[10px] px-2" onClick={() => handleAddChapter(node.name)}>Dodaj</Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="text-[10px] gap-1 text-muted-foreground h-6 px-1"
                          onClick={() => { setAddingChapterFor(node.name); setNewChapterName(""); }}>
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

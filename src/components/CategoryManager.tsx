import { Edit2, Trash2, Check, X, Plus, FolderOpen, ChevronDown, ChevronRight, Tag, Landmark } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { motion, AnimatePresence } from "framer-motion";
import type { BuildingType } from "@/lib/forum-logic";
import { loadMonumentTypes, saveMonumentType } from "@/lib/forum-logic";
import { BUILDING_LABELS, MonumentSVG } from "@/components/gamification/monument-buildings";

const ALL_BUILDING_TYPES: BuildingType[] = [
  "amphitheatrum", "basilica", "tabularium", "rostra",
  "curia", "macellum", "argentaria", "templum", "arcus", "insula",
];

interface Props {
  categories: string[];
  subcategories: Record<string, string[]>;
  cardCountByCategory: Record<string, number>;
  onAdd: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  onAddSub: (category: string, subcategory: string) => void;
  onRenameSub: (category: string, oldName: string, newName: string) => void;
  onDeleteSub: (category: string, subcategory: string) => void;
  onClose?: () => void;
}

export default function CategoryManager({
  categories, subcategories, cardCountByCategory,
  onAdd, onRename, onDelete,
  onAddSub, onRenameSub, onDeleteSub,
  onClose,
}: Props) {
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newCat, setNewCat] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [editingSub, setEditingSub] = useState<{ cat: string; sub: string } | null>(null);
  const [editSubValue, setEditSubValue] = useState("");
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState("");
  const [monumentTypes, setMonumentTypes] = useState<Record<string, BuildingType>>(loadMonumentTypes);

  const startEdit = (cat: string) => {
    setEditingCat(cat);
    setEditValue(cat);
  };

  const confirmEdit = () => {
    if (editingCat && editValue.trim() && editValue.trim() !== editingCat) {
      onRename(editingCat, editValue.trim());
    }
    setEditingCat(null);
    setEditValue("");
  };

  const handleAdd = () => {
    if (newCat.trim() && !categories.includes(newCat.trim())) {
      onAdd(newCat.trim());
      setNewCat("");
      setShowAdd(false);
    }
  };

  const startEditSub = (cat: string, sub: string) => {
    setEditingSub({ cat, sub });
    setEditSubValue(sub);
  };

  const confirmEditSub = () => {
    if (editingSub && editSubValue.trim() && editSubValue.trim() !== editingSub.sub) {
      onRenameSub(editingSub.cat, editingSub.sub, editSubValue.trim());
    }
    setEditingSub(null);
    setEditSubValue("");
  };

  const handleAddSub = (cat: string) => {
    if (newSubName.trim()) {
      onAddSub(cat, newSubName.trim());
      setNewSubName("");
      setAddingSubFor(null);
    }
  };

  const handleSetBuildingType = (cat: string, type: BuildingType) => {
    saveMonumentType(cat, type);
    setMonumentTypes(prev => ({ ...prev, [cat]: type }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Kategorije</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-2">
        <AnimatePresence>
          {categories.map((cat, i) => {
            const count = cardCountByCategory[cat] ?? 0;
            const isEditing = editingCat === cat;
            const isExpanded = expandedCat === cat;
            const subs = subcategories[cat] || [];
            const currentBuilding = monumentTypes[cat] || "insula";

            return (
              <motion.div
                key={cat}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-xl bg-card border overflow-hidden"
              >
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => setExpandedCat(isExpanded ? null : cat)} className="shrink-0">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </button>
                  <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />

                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && confirmEdit()}
                        className="bg-background text-sm h-8"
                        autoFocus
                      />
                      <button onClick={confirmEdit} className="p-1.5 hover:bg-secondary rounded-lg text-success">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditingCat(null)} className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{cat}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {count} kartica
                        </span>
                        {subs.length > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            · {subs.length} podkat.
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {/* Building type picker */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="p-1.5 hover:bg-secondary rounded-lg" title="Tip monumenta">
                              <Landmark className="h-3.5 w-3.5 text-gold" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[280px] p-3" align="end">
                            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Tip zgrade</p>
                            <div className="grid grid-cols-3 gap-2">
                              {ALL_BUILDING_TYPES.map(bt => (
                                <button
                                  key={bt}
                                  onClick={() => handleSetBuildingType(cat, bt)}
                                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${
                                    currentBuilding === bt
                                      ? "border-gold bg-gold/10"
                                      : "border-border hover:border-gold/50"
                                  }`}
                                >
                                  <div className="w-12 h-10">
                                    <MonumentSVG buildingType={bt} tier="complete" />
                                  </div>
                                  <span className="text-[9px] font-medium text-muted-foreground leading-tight text-center">
                                    {BUILDING_LABELS[bt]}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <button onClick={() => startEdit(cat)} className="p-1.5 hover:bg-secondary rounded-lg">
                          <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => onDelete(cat)}
                          className="p-1.5 hover:bg-destructive/10 rounded-lg"
                          title={count > 0 ? `${count} kartica će biti prebačeno u "Opšte"` : "Obriši kategoriju"}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Subcategories */}
                {isExpanded && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-2 bg-secondary/20">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Podkategorije</span>
                    </div>

                    {subs.map((sub) => {
                      const isEditingSub = editingSub?.cat === cat && editingSub?.sub === sub;
                      return (
                        <div key={sub} className="flex items-center gap-2 pl-4">
                          <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
                          {isEditingSub ? (
                            <div className="flex-1 flex items-center gap-2">
                              <Input
                                value={editSubValue}
                                onChange={(e) => setEditSubValue(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && confirmEditSub()}
                                className="bg-background text-xs h-7"
                                autoFocus
                              />
                              <button onClick={confirmEditSub} className="p-1 hover:bg-secondary rounded text-success">
                                <Check className="h-3 w-3" />
                              </button>
                              <button onClick={() => setEditingSub(null)} className="p-1 hover:bg-secondary rounded text-muted-foreground">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="flex-1 text-sm">{sub}</span>
                              <button onClick={() => startEditSub(cat, sub)} className="p-1 hover:bg-secondary rounded-lg">
                                <Edit2 className="h-3 w-3 text-muted-foreground" />
                              </button>
                              <button onClick={() => onDeleteSub(cat, sub)} className="p-1 hover:bg-destructive/10 rounded-lg">
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}

                    {addingSubFor === cat ? (
                      <div className="flex gap-2 pl-4">
                        <Input
                          value={newSubName}
                          onChange={(e) => setNewSubName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddSub(cat)}
                          placeholder="Naziv podkategorije..."
                          className="bg-background text-xs h-7"
                          autoFocus
                        />
                        <button onClick={() => handleAddSub(cat)} className="p-1 hover:bg-secondary rounded text-success">
                          <Check className="h-3 w-3" />
                        </button>
                        <button onClick={() => { setAddingSubFor(null); setNewSubName(""); }} className="p-1 hover:bg-secondary rounded text-muted-foreground">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingSubFor(cat)}
                        className="flex items-center gap-1.5 pl-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Plus className="h-3 w-3" /> Dodaj podkategoriju
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {showAdd ? (
        <div className="flex gap-2">
          <Input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Naziv nove kategorije..."
            className="bg-card"
            autoFocus
          />
          <Button variant="outline" size="icon" onClick={handleAdd}>
            <Check className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => { setShowAdd(false); setNewCat(""); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setShowAdd(true)} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Nova kategorija
        </Button>
      )}
    </div>
  );
}

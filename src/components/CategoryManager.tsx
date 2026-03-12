import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Edit2, Trash2, Check, X, Plus, FolderOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  categories: string[];
  cardCountByCategory: Record<string, number>;
  onAdd: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  onClose: () => void;
}

export default function CategoryManager({ categories, cardCountByCategory, onAdd, onRename, onDelete, onClose }: Props) {
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newCat, setNewCat] = useState("");
  const [showAdd, setShowAdd] = useState(false);

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

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-serif">Kategorije</h2>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-2">
        <AnimatePresence>
          {categories.map((cat, i) => {
            const count = cardCountByCategory[cat] ?? 0;
            const isEditing = editingCat === cat;

            return (
              <motion.div
                key={cat}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 rounded-xl bg-card border p-4"
              >
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
                        {count} {count === 1 ? "kartica" : "kartica"}
                      </span>
                    </div>
                    <div className="flex gap-1">
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

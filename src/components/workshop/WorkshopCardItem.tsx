import { CheckCircle2, Brain, Film, Type, ChevronDown, ChevronRight, Sparkles, Wrench, Hash, MapPin, Clock, List, MoreHorizontal, Tag, Plus, Pencil, Save, X, Trash2 } from "lucide-react";
import { useState, useMemo, memo, useCallback, lazy, Suspense } from "react";
import { MnemonicCard, MnemonicStatus, HookType, HookMode, loadMajorSystem, resolveNumber, extractNumbers, detectEnumerationItems } from "@/lib/mnemonic-storage";


import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
const RichTextEditor = lazy(() => import("@/components/RichTextEditor"));

const STATUS_CONFIG: Record<MnemonicStatus, { label: string; icon: typeof Brain; color: string }> = {
  "new": { label: "Nova", icon: Sparkles, color: "text-muted-foreground" },
  "in-workshop": { label: "U radionici", icon: Wrench, color: "text-warning" },
  "ready": { label: "Spremna", icon: CheckCircle2, color: "text-success" },
};

const HOOK_TYPE_CONFIG: Record<HookType, { label: string; icon: typeof Clock }> = {
  "rokovi": { label: "Rokovi", icon: Clock },
  "nabrajanja": { label: "Nabrajanja", icon: List },
  "ostalo": { label: "Ostalo", icon: MoreHorizontal },
};

interface Props {
  card: MnemonicCard;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateCard: (id: string, updates: Partial<MnemonicCard>) => void;
  onDeleteCard: (id: string) => void;
  majorSystem: Record<number, string>;
}

function WorkshopCardItemInner({ card, isExpanded, onToggle, onUpdateCard, onDeleteCard, majorSystem }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editQuestion, setEditQuestion] = useState("");
  const [editSections, setEditSections] = useState<{ title: string; content: string }[]>([]);
  const [newTag, setNewTag] = useState("");

  const statusConf = STATUS_CONFIG[card.mnemonicStatus];
  const StatusIcon = statusConf.icon;
  const hookConf = HOOK_TYPE_CONFIG[card.hookType];
  const HookIcon = hookConf.icon;

  const allContent = card.sections.map(s => s.content).join(" ");
  const numbers = useMemo(() => isExpanded ? extractNumbers(allContent) : [], [isExpanded, allContent]);
  const enumItems = useMemo(() => isExpanded ? detectEnumerationItems(allContent) : [], [isExpanded, allContent]);

  const startEdit = useCallback(() => {
    setEditQuestion(card.question);
    setEditSections(card.sections.map(s => ({ ...s })));
    setEditMode(true);
  }, [card.question, card.sections]);

  const saveEdit = useCallback(() => {
    onUpdateCard(card.id, { question: editQuestion, sections: editSections });
    setEditMode(false);
  }, [card.id, editQuestion, editSections, onUpdateCard]);

  const cancelEdit = useCallback(() => {
    setEditMode(false);
  }, []);

  const handleDelete = useCallback(() => {
    onDeleteCard(card.id);
    toast.success("Mnemo kartica obrisana.");
  }, [card.id, onDeleteCard]);

  const updateSectionContent = useCallback((idx: number, content: string) => {
    setEditSections(prev => prev.map((s, i) => i === idx ? { ...s, content } : s));
  }, []);

  return (
    <div className="rounded-xl border bg-card overflow-hidden transition-shadow hover:shadow-sm">
      <button
        onClick={onToggle}
        className="w-full p-4 text-left flex items-center gap-3 hover:bg-secondary/30 transition-colors"
      >
        {isExpanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{card.question}</p>
          <p className="text-xs text-muted-foreground">{card.category}{card.subcategory ? ` / ${card.subcategory}` : ""}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {card.testCount > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              card.successCount / card.testCount >= 0.7 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
            }`}>
              {Math.round(card.successCount / card.testCount * 100)}%
            </span>
          )}
          <span className="flex items-center gap-0.5 text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded-full">
            <HookIcon className="h-2.5 w-2.5" /> {hookConf.label}
          </span>
          <div className={`flex items-center gap-1 text-xs font-medium ${statusConf.color}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            {statusConf.label}
          </div>
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t pt-4">
              {/* Sections preview / edit */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sadržaj</p>
                  {!editMode ? (
                    <button
                      onClick={startEdit}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="h-3 w-3" /> Uredi
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={saveEdit}
                        className="flex items-center gap-1 text-xs text-success hover:text-success/80 transition-colors"
                      >
                        <Save className="h-3 w-3" /> Sačuvaj
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-3 w-3" /> Otkaži
                      </button>
                    </div>
                  )}
                </div>

                {editMode ? (
                  <Suspense fallback={<div className="h-20 animate-pulse bg-secondary rounded-lg" />}>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] text-muted-foreground">Pitanje</label>
                        <input
                          value={editQuestion}
                          onChange={e => setEditQuestion(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      {editSections.map((s, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] text-muted-foreground">{s.title}</label>
                            {editSections.length > 1 && (
                              <button
                                onClick={() => setEditSections(prev => prev.filter((_, idx) => idx !== i))}
                                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="h-3 w-3" /> Obriši cjelinu
                              </button>
                            )}
                          </div>
                          <RichTextEditor
                            value={s.content}
                            onChange={val => updateSectionContent(i, val)}
                            placeholder="Unesite sadržaj..."
                            minimal
                          />
                        </div>
                      ))}
                    </div>
                  </Suspense>
                ) : (
                  card.sections.map((s, i) => (
                    <div key={i} className="rounded-lg bg-secondary/30 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">{s.title}</p>
                      <div className="text-sm prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: s.content }} />
                    </div>
                  ))
                )}
              </div>

              {/* Major System suggestions */}
              {numbers.length > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <p className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" /> Major sistem — sugestije
                  </p>
                  <div className="space-y-1.5">
                    {numbers.map(({ number, context }, idx) => {
                      const resolved = resolveNumber(number, majorSystem);
                      return (
                        <div key={idx} className="flex items-start gap-2 text-sm">
                          <span className="font-mono font-bold text-primary min-w-[40px] text-right">{number}</span>
                          <span className="text-foreground font-medium">= {resolved.term}</span>
                          {resolved.location && (
                            <span className="flex items-center gap-0.5 text-xs text-warning">
                              <MapPin className="h-3 w-3" /> {resolved.location}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto truncate max-w-[200px]">„{context}"</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Enumeration detection */}
              {enumItems.length >= 2 && (
                <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 space-y-2">
                  <p className="text-xs font-medium text-warning uppercase tracking-wider flex items-center gap-1.5">
                    <Type className="h-3.5 w-3.5" /> Nabrajanje detektovano — akronim ({enumItems.length} slova)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {enumItems.map((item, idx) => {
                      const firstLetter = item.trim()[0]?.toUpperCase() || "?";
                      return (
                        <div key={idx} className="flex items-center gap-1 px-2 py-1 rounded-md bg-background border text-xs">
                          <span className="font-bold text-warning">{firstLetter}</span>
                          <span className="text-muted-foreground truncate max-w-[120px]">{item}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sugestija: <strong className="text-foreground">{enumItems.map(i => i.trim()[0]?.toUpperCase() || "").join("")}</strong>
                  </p>
                </div>
              )}

              {/* Hook mode selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Kuka:</span>
                <button
                  onClick={() => onUpdateCard(card.id, { hookMode: "video" })}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    card.hookMode === "video" ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <Film className="h-3 w-3" /> Mentalni video
                </button>
                <button
                  onClick={() => onUpdateCard(card.id, { hookMode: "acronym" })}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    card.hookMode === "acronym" ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <Type className="h-3 w-3" /> Akronim
                </button>
              </div>

              {/* Mental Video (shown when hookMode is video) */}
              {card.hookMode === "video" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Film className="h-3.5 w-3.5 text-primary" /> Mentalni video
                  </label>
                  <textarea
                    value={card.mnemonicVideo}
                    onChange={(e) => onUpdateCard(card.id, { mnemonicVideo: e.target.value, mnemonicStatus: card.mnemonicStatus === "new" ? "in-workshop" : card.mnemonicStatus })}
                    placeholder="Opiši živopisnu mentalnu scenu koja ti pomaže da zapamtiš ovu informaciju..."
                    className="w-full min-h-[80px] px-3 py-2 rounded-lg border bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}

              {/* Acronym (shown when hookMode is acronym) */}
              {card.hookMode === "acronym" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Type className="h-3.5 w-3.5 text-primary" /> Akronim / Mentalna kuka
                    {enumItems.length >= 2 && (
                      <span className="text-xs text-muted-foreground ml-1">({enumItems.length} slova potrebno)</span>
                    )}
                  </label>
                  <input
                    value={card.acronym}
                    onChange={(e) => onUpdateCard(card.id, { acronym: e.target.value, mnemonicStatus: card.mnemonicStatus === "new" ? "in-workshop" : card.mnemonicStatus })}
                    placeholder={enumItems.length >= 2
                      ? `Unesite akronim od ${enumItems.length} slova (npr. ${enumItems.map(i => i.trim()[0]?.toUpperCase() || "").join("")})`
                      : "Npr. kratka reč, broj iz Major Sistema, asocijacija..."}
                    className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {enumItems.length >= 2 && card.acronym.length > 0 && card.acronym.length !== enumItems.length && (
                    <p className="text-xs text-warning">⚠ Akronim ima {card.acronym.length} slova, a nabrajanje ima {enumItems.length} stavki</p>
                  )}
                </div>
              )}

              {/* Hook type selector + Status */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex gap-1.5">
                  {(["rokovi", "nabrajanja", "ostalo"] as HookType[]).map((ht) => {
                    const conf = HOOK_TYPE_CONFIG[ht];
                    const Icon = conf.icon;
                    return (
                      <button
                        key={ht}
                        onClick={() => onUpdateCard(card.id, { hookType: ht })}
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                          card.hookType === ht ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {conf.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  {(["new", "in-workshop", "ready"] as MnemonicStatus[]).map((s) => {
                    const conf = STATUS_CONFIG[s];
                    const Icon = conf.icon;
                    return (
                      <button
                        key={s}
                        onClick={() => onUpdateCard(card.id, { mnemonicStatus: s })}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          card.mnemonicStatus === s ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {conf.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="h-3 w-3" /> Oznake
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(card.tags || []).map(tag => (
                    <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs font-medium">
                      {tag}
                      <button onClick={() => {
                        const updated = (card.tags || []).filter(t => t !== tag);
                        onUpdateCard(card.id, { tags: updated });
                      }} className="text-muted-foreground hover:text-destructive">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                  <div className="flex items-center gap-1">
                    <input
                      value={newTag}
                      onChange={e => setNewTag(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && newTag.trim()) {
                          const existing = card.tags || [];
                          if (!existing.includes(newTag.trim())) {
                            onUpdateCard(card.id, { tags: [...existing, newTag.trim()] });
                          }
                          setNewTag("");
                        }
                      }}
                      placeholder="Novi tag..."
                      className="w-24 px-2 py-0.5 rounded-md border bg-background text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <button
                      onClick={() => {
                        if (newTag.trim()) {
                          const existing = card.tags || [];
                          if (!existing.includes(newTag.trim())) {
                            onUpdateCard(card.id, { tags: [...existing, newTag.trim()] });
                          }
                          setNewTag("");
                        }
                      }}
                      className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Delete + stats */}
              <div className="flex items-center justify-between pt-1 border-t border-dashed">
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" /> Obriši
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-destructive">Obrisati?</span>
                    <button onClick={handleDelete} className="text-xs font-medium text-destructive hover:text-destructive/80">Da</button>
                    <button onClick={() => setConfirmDelete(false)} className="text-xs text-muted-foreground hover:text-foreground">Ne</button>
                  </div>
                )}
                {card.testCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {card.successCount}/{card.testCount} tačno ({Math.round(card.successCount / card.testCount * 100)}%)
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const WorkshopCardItem = memo(WorkshopCardItemInner);
export default WorkshopCardItem;

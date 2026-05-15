import {
  ChevronDown, ChevronRight, Pencil, Save, X, Trash2,
} from "lucide-react";
import { useMemo, memo, lazy, Suspense } from "react";
import {
  MnemonicCard, MnemonicStatus, HookType,
  extractNumbers, detectEnumerationItems,
} from "@/lib/mnemonic-storage";
import { useCategoryData } from "@/contexts/AppContext";
import { SafeHtml } from "@/components/ui/safe-html";
import { motion, AnimatePresence } from "framer-motion";
import { STATUS_CONFIG, HOOK_TYPE_CONFIG } from "./card-item/configs";
import { MajorSystemHints } from "./card-item/MajorSystemHints";
import { EnumerationHints } from "./card-item/EnumerationHints";
import { HookEditor } from "./card-item/HookEditor";
import { TagsEditor } from "./card-item/TagsEditor";
import { useCardItemEditing } from "@/hooks/workshop/useCardItemEditing";

const RichTextEditor = lazy(() => import("@/components/RichTextEditor"));

interface Props {
  card: MnemonicCard;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateCard: (id: string, updates: Partial<MnemonicCard>) => void;
  onDeleteCard: (id: string) => void;
  majorSystem: Record<number, string>;
}

function WorkshopCardItemInner({ card, isExpanded, onToggle, onUpdateCard, onDeleteCard, majorSystem }: Props) {
  const { categoryRecords } = useCategoryData();
  const catRecord = categoryRecords.find((r) => r.id === card.categoryId);
  const catName = catRecord?.name ?? card.categoryId;
  const subName = useMemo(() => {
    if (!catRecord) return card.subcategoryId || "";
    const sid = card.subcategoryId;
    if (!sid) return "";
    const node = (catRecord.subcategories || []).find((s: { id: string; name: string }) => s.id === sid || s.name === sid);
    return node?.name ?? sid;
  }, [catRecord, card.subcategoryId]);

  const {
    editMode, editQuestion, setEditQuestion, editSections,
    startEdit, saveEdit, cancelEdit,
    updateSectionContent, removeSection,
    confirmDelete, setConfirmDelete, handleDelete,
  } = useCardItemEditing(card, onUpdateCard, onDeleteCard);

  const statusConf = STATUS_CONFIG[card.mnemonicStatus];
  const StatusIcon = statusConf.icon;
  const hookConf = HOOK_TYPE_CONFIG[card.hookType];
  const HookIcon = hookConf.icon;

  const allContent = card.sections.map((s) => s.content).join(" ");
  const numbers = useMemo(() => (isExpanded ? extractNumbers(allContent) : []), [isExpanded, allContent]);
  const enumItems = useMemo(() => (isExpanded ? detectEnumerationItems(allContent) : []), [isExpanded, allContent]);

  return (
    <div className="rounded-xl border bg-card overflow-hidden transition-shadow hover:shadow-sm">
      <button
        onClick={onToggle}
        className="w-full p-4 text-left flex items-center gap-3 hover:bg-secondary/30 transition-colors"
      >
        {isExpanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{card.question}</p>
          <p className="text-xs text-muted-foreground">{catName}{subName ? ` / ${subName}` : ""}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {card.testCount > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              card.successCount / card.testCount >= 0.7 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
            }`}>
              {Math.round((card.successCount / card.testCount) * 100)}%
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
                    <button onClick={startEdit} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-3 w-3" /> Uredi
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button onClick={saveEdit} className="flex items-center gap-1 text-xs text-success hover:text-success/80 transition-colors">
                        <Save className="h-3 w-3" /> Sačuvaj
                      </button>
                      <button onClick={cancelEdit} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
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
                          onChange={(e) => setEditQuestion(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </div>
                      {editSections.map((s, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] text-muted-foreground">{s.title}</label>
                            {editSections.length > 1 && (
                              <button
                                onClick={() => removeSection(i)}
                                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                              >
                                <Trash2 className="h-3 w-3" /> Obriši cjelinu
                              </button>
                            )}
                          </div>
                          <RichTextEditor
                            value={s.content}
                            onChange={(val) => updateSectionContent(i, val)}
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
                      <SafeHtml className="text-sm prose prose-sm max-w-none card-prose" html={s.content} />
                    </div>
                  ))
                )}
              </div>

              <MajorSystemHints numbers={numbers} majorSystem={majorSystem} />
              <EnumerationHints items={enumItems} />

              <HookEditor card={card} enumItemsLen={enumItems.length} onUpdate={(patch) => onUpdateCard(card.id, patch)} />

              {/* Hook type + status selectors */}
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

              <TagsEditor tags={card.tags || []} onChange={(tags) => onUpdateCard(card.id, { tags })} />

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
                    {card.successCount}/{card.testCount} tačno ({Math.round((card.successCount / card.testCount) * 100)}%)
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

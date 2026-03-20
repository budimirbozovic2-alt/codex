import { useState, useMemo } from "react";
import { MnemonicCard, MnemonicStatus, HookType, loadMajorSystem, resolveNumber, extractNumbers, detectEnumerationItems } from "@/lib/mnemonic-storage";
import { CheckCircle2 } from "lucide-react";
import { default as ArrowLeft } from "lucide-react/dist/esm/icons/arrow-left";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { default as Film } from "lucide-react/dist/esm/icons/film";
import { default as Type } from "lucide-react/dist/esm/icons/type";
import { default as ChevronDown } from "lucide-react/dist/esm/icons/chevron-down";
import { default as ChevronRight } from "lucide-react/dist/esm/icons/chevron-right";
import { default as Sparkles } from "lucide-react/dist/esm/icons/sparkles";
import { default as Wrench } from "lucide-react/dist/esm/icons/wrench";
import { default as Hash } from "lucide-react/dist/esm/icons/hash";
import { default as MapPin } from "lucide-react/dist/esm/icons/map-pin";
import { default as FolderOpen } from "lucide-react/dist/esm/icons/folder-open";
import { default as Clock } from "lucide-react/dist/esm/icons/clock";
import { default as List } from "lucide-react/dist/esm/icons/list";
import { default as MoreHorizontal } from "lucide-react/dist/esm/icons/more-horizontal";
import InfoPanel from "@/components/InfoPanel";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  cards: MnemonicCard[];
  onUpdateCard: (id: string, updates: Partial<MnemonicCard>) => void;
  onBack: () => void;
}

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

export default function MnemonicWorkshop({ cards, onUpdateCard, onBack }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<MnemonicStatus | "all">("all");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);

  const majorSystem = useMemo(() => loadMajorSystem(), [expandedId]);

  // Build category tree
  const categoryTree = useMemo(() => {
    const tree: Record<string, Set<string>> = {};
    cards.forEach(c => {
      if (!tree[c.category]) tree[c.category] = new Set();
      if (c.subcategory) tree[c.category].add(c.subcategory);
    });
    return tree;
  }, [cards]);

  const categories = Object.keys(categoryTree).sort();

  // Filter cards
  const filtered = useMemo(() => {
    let result = cards;
    if (filterStatus !== "all") result = result.filter(c => c.mnemonicStatus === filterStatus);
    if (selectedCategory) result = result.filter(c => c.category === selectedCategory);
    if (selectedSubcategory) result = result.filter(c => c.subcategory === selectedSubcategory);
    return result;
  }, [cards, filterStatus, selectedCategory, selectedSubcategory]);

  const subcategories = selectedCategory ? [...(categoryTree[selectedCategory] || [])] : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          <h2 className="text-3xl font-serif flex items-center gap-3">
            <Wrench className="h-7 w-7 text-primary" /> Radionica mentalnih kuka
          </h2>
          <p className="text-muted-foreground mt-1">Kreiraj mentalni video i akronim za svaku karticu.</p>
        </div>
        <InfoPanel title="Kako radi Mnemo radionica?">
          <p><strong className="text-foreground">Mentalne kuke</strong> — za svaku karticu kreiraš vizuelnu asocijaciju (mentalni video) ili akronim koji pomaže pamćenju.</p>
          <p><strong className="text-foreground">Status:</strong></p>
          <ul className="space-y-1 pl-3">
            <li>✨ <strong>Nova</strong> — čeka obradu</li>
            <li>🔧 <strong>U radionici</strong> — kuka u izradi</li>
            <li>✅ <strong>Spremna</strong> — kuka završena i spremna za testiranje</li>
          </ul>
          <p><strong className="text-foreground">Major sistem</strong> — brojevi se automatski pretvaraju u riječi pomoću fonetskog koda (0=S, 1=T, 2=N...).</p>
          <p>Označi kartice tagom „Memorizacija" u Bazi podataka da se pojave ovdje.</p>
        </InfoPanel>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left sidebar: Folder navigation (Sef) */}
        <div className="md:w-56 flex-shrink-0 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" /> Predmeti
          </p>
          <div className="space-y-1">
            <button
              onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedCategory ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
            >
              Sve ({cards.length})
            </button>
            {categories.map(cat => {
              const count = cards.filter(c => c.category === cat).length;
              const isSelected = selectedCategory === cat;
              return (
                <div key={cat}>
                  <button
                    onClick={() => { setSelectedCategory(isSelected ? null : cat); setSelectedSubcategory(null); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${isSelected ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"}`}
                  >
                    <span className="truncate">{cat}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? "bg-primary-foreground/20" : "bg-secondary text-muted-foreground"}`}>{count}</span>
                  </button>
                  {/* Subcategories */}
                  {isSelected && subcategories.length > 0 && (
                    <div className="ml-3 mt-1 space-y-0.5 border-l-2 border-primary/20 pl-2">
                      {subcategories.map(sub => {
                        const subCount = cards.filter(c => c.category === cat && c.subcategory === sub).length;
                        return (
                          <button
                            key={sub}
                            onClick={() => setSelectedSubcategory(selectedSubcategory === sub ? null : sub)}
                            className={`w-full text-left px-2 py-1 rounded text-xs transition-colors ${selectedSubcategory === sub ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            {sub} ({subCount})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Status filter */}
          <div className="pt-2 border-t space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</p>
            {(["all", "new", "in-workshop", "ready"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterStatus === status ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {status === "all" ? `Sve (${cards.length})` : `${STATUS_CONFIG[status].label} (${cards.filter(c => c.mnemonicStatus === status).length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Right content: Cards */}
        <div className="flex-1 min-w-0">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nema kartica u ovoj kategoriji.</p>
              <p className="text-sm mt-1">Označi kartice tagom "Memorizacija" da ih dodaš ovdje.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{filtered.length} kartica</p>
              {filtered.map((card) => {
                const isExpanded = expandedId === card.id;
                const statusConf = STATUS_CONFIG[card.mnemonicStatus];
                const StatusIcon = statusConf.icon;
                const hookConf = HOOK_TYPE_CONFIG[card.hookType];
                const HookIcon = hookConf.icon;

                const allContent = card.sections.map(s => s.content).join(" ");
                const numbers = isExpanded ? extractNumbers(allContent) : [];
                const enumItems = isExpanded ? detectEnumerationItems(allContent) : [];

                return (
                  <div key={card.id} className="rounded-xl border bg-card overflow-hidden">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : card.id)}
                      className="w-full p-4 text-left flex items-center gap-3 hover:bg-secondary/30 transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{card.question}</p>
                        <p className="text-xs text-muted-foreground">{card.category}{card.subcategory ? ` / ${card.subcategory}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
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
                            {/* Sections preview */}
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sadržaj</p>
                              {card.sections.map((s, i) => (
                                <div key={i} className="rounded-lg bg-secondary/30 p-3">
                                  <p className="text-xs font-medium text-muted-foreground mb-1">{s.title}</p>
                                  <div className="text-sm prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: s.content }} />
                                </div>
                              ))}
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

                            {/* Mental Video */}
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

                            {/* Acronym */}
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

                            {card.testCount > 0 && (
                              <p className="text-xs text-muted-foreground text-right">
                                {card.successCount}/{card.testCount} tačno ({Math.round(card.successCount / card.testCount * 100)}%)
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { RotateCcw, Database, FolderOpen, ArrowLeft } from "lucide-react";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { AppSettings, DEFAULT_APP_SETTINGS, loadAppSettings, saveAppSettings } from "@/lib/app-settings";
import { TTSSettings, loadTTSSettings, saveTTSSettings, getAvailableVoices } from "@/lib/tts";
import { loadSubjectSettings, saveSubjectSettings, clearSubjectSettings, SubjectSettings } from "@/lib/subject-settings";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InfoPanel from "@/components/InfoPanel";
import ExportImportDialog from "@/components/ExportImportDialog";
import { useCardData, useCategoryData, useCategoryActions, useBackupActions } from "@/contexts/AppContext";
import AlgorithmTab from "@/components/settings/AlgorithmTab";
import PersonalizationTab from "@/components/settings/PersonalizationTab";
import WorkflowTab from "@/components/settings/WorkflowTab";
import SubjectsTab from "@/components/settings/SubjectsTab";
import SystemTab from "@/components/settings/SystemTab";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { getParam } from "@/lib/url-params";
import { shallowEqual } from "@/lib/struct-eq";

interface Props {
  settings: SRSettings;
  onUpdate: (settings: SRSettings) => void;
}

export default function SRSettingsPanel({ settings, onUpdate }: Props) {
  const [searchParams] = useSearchParams();
  const subjectId = getParam(searchParams, "category");

  const initialTab = useMemo(() => {
    const t = searchParams.get("tab");
    return t && ["algorithm", "personalization", "workflow", "subjects", "system"].includes(t) ? t : "algorithm";
  }, [searchParams]);

  // ─── Subject-scoped state ───────────────────────────────
  const { categoryRecords } = useCategoryData();
  const subjectName = useMemo(
    () => subjectId ? categoryRecords.find(r => r.id === subjectId)?.name ?? "Predmet" : null,
    [subjectId, categoryRecords],
  );

  const existingOverrides = useMemo(
    () => subjectId ? loadSubjectSettings(subjectId) : null,
    [subjectId],
  );
  const [overridesEnabled, setOverridesEnabled] = useState(existingOverrides !== null);

  // ─── Global state ──────────────────────────────────────
  const [local, setLocal] = useState<SRSettings>(() => {
    if (subjectId && existingOverrides) {
      return {
        ...settings,
        ...(existingOverrides.leechThreshold !== undefined && { leechThreshold: existingOverrides.leechThreshold }),
        ...(existingOverrides.dailyGoal !== undefined && { dailyGoal: existingOverrides.dailyGoal }),
        ...(existingOverrides.resistanceWeights !== undefined && { resistanceWeights: existingOverrides.resistanceWeights }),
      };
    }
    return { ...settings };
  });

  const [app, setApp] = useState<AppSettings>(() => {
    const globalApp = loadAppSettings();
    if (subjectId && existingOverrides?.targetRetention !== undefined) {
      return { ...globalApp, targetRetention: existingOverrides.targetRetention };
    }
    return globalApp;
  });

  const initialAppRef = useRef(loadAppSettings());
  const initialTtsRef = useRef(loadTTSSettings());

  const [scrolled, setScrolled] = useState(false);
  const stickyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 1, rootMargin: "-1px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [exportImportOpen, setExportImportOpen] = useState(false);
  const { cards, cardCountByCategory } = useCardData();
  const { categories, subcategories } = useCategoryData();
  const { exportData, exportTemplate, importData } = useBackupActions();
  const { addCategory, renameCategory, deleteCategory } = useCategoryActions();
  const [tts, setTts] = useState<TTSSettings>(initialTtsRef.current);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      const v = getAvailableVoices();
      if (v.length > 0) setVoices(v);
    };
    loadVoices();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => { if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  // ─── Save logic ────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (subjectId && overridesEnabled) {
      // Save subject-scoped overrides only
      const overrides: SubjectSettings = {
        targetRetention: app.targetRetention,
        leechThreshold: local.leechThreshold,
        dailyGoal: local.dailyGoal,
        resistanceWeights: local.resistanceWeights,
      };
      saveSubjectSettings(subjectId, overrides);
      toast.success(`Podešavanja za "${subjectName}" sačuvana`);
    } else if (subjectId && !overridesEnabled) {
      // Clear subject overrides, keep global
      clearSubjectSettings(subjectId);
      toast.success("Subjektna podešavanja uklonjena — koriste se globalna");
    } else {
      // Global save
      onUpdate(local);
      saveTTSSettings(tts);
      saveAppSettings(app);
    }
  }, [subjectId, overridesEnabled, local, app, tts, onUpdate, subjectName]);

  const handleReset = useCallback(() => {
    if (subjectId) {
      // Reset to global values
      setLocal({ ...settings });
      setApp(initialAppRef.current);
      setOverridesEnabled(false);
    } else {
      setLocal({ ...DEFAULT_SR_SETTINGS });
      setApp({ ...DEFAULT_APP_SETTINGS });
    }
  }, [subjectId, settings]);

  const isSubjectMode = !!subjectId;

  // Dirty/default detection: compare by stable shallow equality. SRSettings,
  // TTSSettings and AppSettings are flat objects of primitives, so shallowEqual
  // is both correct and dramatically cheaper than JSON.stringify on every render.
  const hasChanges = isSubjectMode
    ? (overridesEnabled !== (existingOverrides !== null)) ||
      (overridesEnabled && (
        !shallowEqual(local as unknown as Record<string, unknown>, settings as unknown as Record<string, unknown>) ||
        app.targetRetention !== initialAppRef.current.targetRetention
      ))
    : !shallowEqual(local as unknown as Record<string, unknown>, settings as unknown as Record<string, unknown>) ||
      !shallowEqual(tts as unknown as Record<string, unknown>, initialTtsRef.current as unknown as Record<string, unknown>) ||
      !shallowEqual(app as unknown as Record<string, unknown>, initialAppRef.current as unknown as Record<string, unknown>);

  const isDefault =
    shallowEqual(local as unknown as Record<string, unknown>, DEFAULT_SR_SETTINGS as unknown as Record<string, unknown>) &&
    shallowEqual(app as unknown as Record<string, unknown>, DEFAULT_APP_SETTINGS as unknown as Record<string, unknown>);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {isSubjectMode && (
            <Link
              to={`/subject/${subjectId}`}
              className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Nazad na predmet"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <div className="min-w-0">
            <h2 className="imperial-title truncate">
              {isSubjectMode ? `Podešavanja — ${subjectName}` : "Podešavanja"}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isSubjectMode
                ? "Algoritam prilagođen ovom predmetu"
                : "Algoritam, interfejs, tok rada i sistem"}
            </p>
          </div>
        </div>
        {!isSubjectMode && (
          <InfoPanel title="O podešavanjima">
            <p><strong className="text-foreground">FSRS v5</strong> — algoritam za optimalni raspored ponavljanja.</p>
            <p><strong className="text-foreground">Ciljna retencija</strong> — podesi stopu zadržavanja (85-99%).</p>
            <p><strong className="text-foreground">Dashboard</strong> — prilagodi koje widgete vidiš na pregledu.</p>
            <p><strong className="text-foreground">Zvučni efekti</strong> — tonovi pri ocjenjivanju i završetku sesije.</p>
            <p><strong className="text-foreground">TTS</strong> — podesi brzinu i glas za čitanje naglas.</p>
            <p className="pt-1 border-t border-border mt-1"><strong className="text-foreground">Prečice:</strong></p>
            <div className="space-y-1">
              <div className="flex items-center justify-between"><span>Workflow sidebar</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">M</kbd></div>
              <div className="flex items-center justify-between"><span>Zatvori modal</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">ESC</kbd></div>
            </div>
          </InfoPanel>
        )}
      </div>

      {/* Subject override toggle */}
      {isSubjectMode && (
        <div className="glass-card rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Prilagođena podešavanja</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {overridesEnabled
                ? "Ovaj predmet koristi svoja podešavanja algoritma."
                : "Ovaj predmet koristi globalna podešavanja. Uključi za prilagodbu."}
            </p>
          </div>
          <Switch checked={overridesEnabled} onCheckedChange={setOverridesEnabled} />
        </div>
      )}

      <div ref={stickyRef} className="h-0" />

      {isSubjectMode ? (
        /* Subject mode — only Algorithm tab */
        <div className={`transition-opacity duration-200 ${overridesEnabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
          <AlgorithmTab local={local} setLocal={setLocal} app={app} setApp={setApp} />
        </div>
      ) : (
        /* Global mode — full tabs */
        <Tabs defaultValue={initialTab} className="w-full">
          <div className={`sticky top-0 z-10 bg-background pb-4 -mx-1 px-1 transition-shadow duration-200 ${scrolled ? "shadow-md" : ""}`}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="algorithm">Algoritam</TabsTrigger>
              <TabsTrigger value="personalization">Personalizacija</TabsTrigger>
              <TabsTrigger value="workflow">Tok rada</TabsTrigger>
              <TabsTrigger value="subjects" className="gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" />
                Predmeti
              </TabsTrigger>
              <TabsTrigger value="system" className="gap-1.5">
                <Database className="h-3.5 w-3.5" />
                Sistem
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="algorithm" className="mt-0">
            <AlgorithmTab local={local} setLocal={setLocal} app={app} setApp={setApp} />
          </TabsContent>

          <TabsContent value="personalization" className="mt-0">
            <PersonalizationTab app={app} setApp={setApp} />
          </TabsContent>

          <TabsContent value="workflow" className="mt-0">
            <WorkflowTab app={app} setApp={setApp} tts={tts} setTts={setTts} voices={voices} />
          </TabsContent>

          <TabsContent value="subjects" className="mt-0">
            <SubjectsTab
              categories={categories}
              subcategories={subcategories}
              categoryRecords={categoryRecords}
              cardCountByCategory={cardCountByCategory}
              onAdd={addCategory}
              onRename={renameCategory}
              onDelete={deleteCategory}
            />
          </TabsContent>

          <TabsContent value="system" className="mt-0">
            <SystemTab onOpenExportImport={() => setExportImportOpen(true)} />
          </TabsContent>
        </Tabs>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pb-4">
        <Button onClick={handleSave} disabled={!hasChanges} className="flex-1">
          {isSubjectMode ? "Sačuvaj za predmet" : "Sačuvaj izmjene"}
        </Button>
        <Button onClick={handleReset} variant="outline" disabled={isSubjectMode ? !overridesEnabled : isDefault}>
          <RotateCcw className="h-4 w-4 mr-2" />
          {isSubjectMode ? "Globalne vrijednosti" : "Podrazumijevano"}
        </Button>
      </div>
      <div className="pb-8" />

      {!isSubjectMode && (
        <ExportImportDialog
          open={exportImportOpen}
          onOpenChange={setExportImportOpen}
          onExportTemplate={exportTemplate}
          onExportFull={exportData}
          onImport={importData}
          cards={cards}
        />
      )}
    </div>
  );
}

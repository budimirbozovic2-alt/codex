import { RotateCcw, Database } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { AppSettings, DEFAULT_APP_SETTINGS, loadAppSettings, saveAppSettings } from "@/lib/app-settings";
import { TTSSettings, DEFAULT_TTS_SETTINGS, loadTTSSettings, saveTTSSettings, getAvailableVoices } from "@/lib/tts";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InfoPanel from "@/components/InfoPanel";
import ExportImportDialog from "@/components/ExportImportDialog";
import { useCardData, useCategoryData, useCardActions } from "@/contexts/AppContext";
import AlgorithmTab from "@/components/settings/AlgorithmTab";
import PersonalizationTab from "@/components/settings/PersonalizationTab";
import WorkflowTab from "@/components/settings/WorkflowTab";
import SystemTab from "@/components/settings/SystemTab";

interface Props {
  settings: SRSettings;
  onUpdate: (settings: SRSettings) => void;
}

export default function SRSettingsPanel({ settings, onUpdate }: Props) {
  const [local, setLocal] = useState<SRSettings>({ ...settings });
  const initialAppRef = useRef(loadAppSettings());
  const initialTtsRef = useRef(loadTTSSettings());
  const [exportImportOpen, setExportImportOpen] = useState(false);
  const { cards, cardCountByCategory } = useCardData();
  const { categories, subcategories, categoryRecords } = useCategoryData();
  const { exportData, exportTemplate, importData, addCategory, renameCategory, deleteCategory } = useCardActions();
  const [app, setApp] = useState<AppSettings>(initialAppRef.current);
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

  const handleSave = () => {
    onUpdate(local);
    saveTTSSettings(tts);
    saveAppSettings(app);
  };

  const handleReset = () => {
    setLocal({ ...DEFAULT_SR_SETTINGS });
    setApp({ ...DEFAULT_APP_SETTINGS });
  };

  const hasChanges = JSON.stringify(local) !== JSON.stringify(settings) ||
    JSON.stringify(tts) !== JSON.stringify(initialTtsRef.current) ||
    JSON.stringify(app) !== JSON.stringify(initialAppRef.current);
  const isDefault = JSON.stringify(local) === JSON.stringify(DEFAULT_SR_SETTINGS) &&
    JSON.stringify(app) === JSON.stringify(DEFAULT_APP_SETTINGS);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="imperial-title">Podešavanja</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Algoritam, interfejs, tok rada i sistem</p>
        </div>
        <InfoPanel title="O podešavanjima">
          <p><strong className="text-foreground">FSRS v5</strong> — algoritam za optimalni raspored ponavljanja.</p>
          <p><strong className="text-foreground">Ciljna retencija</strong> — podesi stopu zadržavanja (85-99%).</p>
          <p><strong className="text-foreground">Dashboard</strong> — prilagodi koje widgete vidiš na pregledu.</p>
          <p><strong className="text-foreground">Zvučni efekti</strong> — tonovi pri ocjenjivanju i završetku sesije.</p>
          <p><strong className="text-foreground">TTS</strong> — podesi brzinu i glas za čitanje naglas.</p>
        </InfoPanel>
      </div>

      <Tabs defaultValue="algorithm" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="algorithm">Algoritam</TabsTrigger>
          <TabsTrigger value="personalization">Personalizacija</TabsTrigger>
          <TabsTrigger value="workflow">Tok rada</TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5">
            <Database className="h-3.5 w-3.5" />
            Sistem
          </TabsTrigger>
        </TabsList>

        <TabsContent value="algorithm" className="mt-0">
          <AlgorithmTab local={local} setLocal={setLocal} app={app} setApp={setApp} />
        </TabsContent>

        <TabsContent value="personalization" className="mt-0">
          <PersonalizationTab app={app} setApp={setApp} />
        </TabsContent>

        <TabsContent value="workflow" className="mt-0">
          <WorkflowTab app={app} setApp={setApp} tts={tts} setTts={setTts} voices={voices} />
        </TabsContent>

        <TabsContent value="system" className="mt-0">
          <SystemTab
            categories={categories}
            subcategories={subcategories}
            categoryRecords={categoryRecords}
            cardCountByCategory={cardCountByCategory}
            onAdd={addCategory}
            onRename={renameCategory}
            onDelete={deleteCategory}
            onOpenExportImport={() => setExportImportOpen(true)}
          />
        </TabsContent>
      </Tabs>

      {/* Action buttons */}
      <div className="flex gap-3 pb-4">
        <Button onClick={handleSave} disabled={!hasChanges} className="flex-1">
          Sačuvaj izmjene
        </Button>
        <Button onClick={handleReset} variant="outline" disabled={isDefault}>
          <RotateCcw className="h-4 w-4 mr-2" /> Podrazumijevano
        </Button>
      </div>
      <div className="pb-8" />

      <ExportImportDialog
        open={exportImportOpen}
        onOpenChange={setExportImportOpen}
        onExportTemplate={exportTemplate}
        onExportFull={exportData}
        onImport={importData}
        cards={cards}
      />
    </div>
  );
}

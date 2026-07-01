import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  saveAppSettings,
} from "@/lib/app-settings";
import { TTSSettings, loadTTSSettings, saveTTSSettings, getAvailableVoices } from "@/lib/tts";
import {
  loadSubjectSettings,
  saveSubjectSettings,
  clearSubjectSettings,
  mergeSubjectOverrides,
  type SubjectSettings,
} from "@/domains/subjects/subject-settings";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { useCategoryActions } from "@/hooks/cards/useActions";
import { useCardCountsByCategoryMap } from "@/store";
import { getParam } from "@/lib/url-params";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { shallowEqual } from "@/lib/struct-eq";
import { useLatestRef } from "@/hooks/useLatestRef";
import { SettingsContext, type SettingsContextValue } from "./SettingsContext";

interface SettingsProviderProps {
  settings: SRSettings;
  onUpdate: (settings: SRSettings) => void;
  children: ReactNode;
}

export function SettingsProvider({ settings, onUpdate, children }: SettingsProviderProps) {
  const [searchParams] = useSearchParams();
  const subjectId = getParam(searchParams, "category");

  const { categoryRecords, categories, subcategories } = useCategoryData();
  const cardCountByCategory = useCardCountsByCategoryMap(categories);
  const { addCategory, renameCategory, deleteCategory } = useCategoryActions();

  const subjectName = useMemo(
    () => (subjectId ? categoryRecords.find((r) => r.id === subjectId)?.name ?? "Predmet" : null),
    [subjectId, categoryRecords],
  );

  const existingOverrides = useMemo(
    () => (subjectId ? loadSubjectSettings(subjectId) : null),
    [subjectId],
  );

  const [overridesEnabled, setOverridesEnabled] = useState(existingOverrides !== null);
  const [local, setLocal] = useState<SRSettings>(() =>
    subjectId && existingOverrides ? mergeSubjectOverrides(settings, existingOverrides) : { ...settings },
  );
  const [app, setApp] = useState<AppSettings>(() =>
    mergeSubjectOverrides(loadAppSettings(), subjectId ? existingOverrides : null),
  );
  const [tts, setTts] = useState<TTSSettings>(() => loadTTSSettings());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const initialAppRef = useRef(loadAppSettings());
  const initialTtsRef = useRef(loadTTSSettings());
  const persistedTargetRetentionRef = useRef(initialAppRef.current.targetRetention);

  const localRef = useLatestRef(local);
  const appRef = useLatestRef(app);
  const ttsRef = useLatestRef(tts);
  const overridesEnabledRef = useLatestRef(overridesEnabled);
  const subjectNameRef = useLatestRef(subjectName);

  const AUTO_SAVE_MS = 400;

  useEffect(() => {
    if (subjectId) return;

    const appSnapshot = { ...app, targetRetention: persistedTargetRetentionRef.current };
    const baseline = { ...initialAppRef.current, targetRetention: persistedTargetRetentionRef.current };
    if (shallowEqual(appSnapshot, baseline)) return;

    const timer = setTimeout(() => {
      const next = { ...appRef.current, targetRetention: persistedTargetRetentionRef.current };
      void saveAppSettings(next)
        .then(() => {
          initialAppRef.current = next;
        })
        .catch((err) => {
          logger.error("[SettingsProvider] app auto-save failed", err);
          toast.error("Postavke nisu sačuvane u bazu. Pokušaj ponovo.");
        });
    }, AUTO_SAVE_MS);

    return () => clearTimeout(timer);
  }, [app, subjectId, appRef]);

  useEffect(() => {
    if (subjectId) return;
    if (shallowEqual(tts, initialTtsRef.current)) return;

    const timer = setTimeout(() => {
      try {
        saveTTSSettings(ttsRef.current);
        initialTtsRef.current = ttsRef.current;
      } catch (err) {
        logger.error("[SettingsProvider] tts auto-save failed", err);
        toast.error("TTS postavke nisu sačuvane. Pokušaj ponovo.");
      }
    }, AUTO_SAVE_MS);

    return () => clearTimeout(timer);
  }, [tts, subjectId, ttsRef]);

  useEffect(() => {
    const loadVoices = () => {
      const v = getAvailableVoices();
      if (v.length > 0) setVoices(v);
    };
    loadVoices();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const handleSave = useCallback(async () => {
    const curLocal = localRef.current;
    const curApp = appRef.current;
    const curOverridesEnabled = overridesEnabledRef.current;
    try {
      if (subjectId && curOverridesEnabled) {
        const overrides: SubjectSettings = {
          targetRetention: curApp.targetRetention,
          leechThreshold: curLocal.leechThreshold,
          dailyGoal: curLocal.dailyGoal,
          resistanceWeights: curLocal.resistanceWeights,
        };
        await saveSubjectSettings(subjectId, overrides);
        persistedTargetRetentionRef.current = curApp.targetRetention;
        toast.success(`Podešavanja za "${subjectNameRef.current}" sačuvana`);
      } else if (subjectId && !curOverridesEnabled) {
        await clearSubjectSettings(subjectId);
        toast.success("Subjektna podešavanja uklonjena — koriste se globalna");
      } else {
        onUpdate(curLocal);
        await saveAppSettings(curApp);
        persistedTargetRetentionRef.current = curApp.targetRetention;
        initialAppRef.current = { ...curApp };
        toast.success("Podešavanja algoritma sačuvana");
      }
    } catch (err) {
      logger.error("[SettingsProvider] save failed", err);
      toast.error("Postavke nisu sačuvane u bazu. Pokušaj ponovo.");
    }
  }, [subjectId, onUpdate, appRef, localRef, overridesEnabledRef, subjectNameRef]);

  const handleReset = useCallback(() => {
    if (subjectId) {
      setLocal({ ...settings });
      setApp((prev) => ({ ...prev, targetRetention: initialAppRef.current.targetRetention }));
      setOverridesEnabled(false);
    } else {
      setLocal({ ...DEFAULT_SR_SETTINGS });
      setApp((prev) => ({ ...prev, targetRetention: DEFAULT_APP_SETTINGS.targetRetention }));
    }
  }, [subjectId, settings]);

  const hasChanges = subjectId
    ? overridesEnabled !== (existingOverrides !== null) ||
      (overridesEnabled &&
        (!shallowEqual(local, settings) ||
          app.targetRetention !== (existingOverrides?.targetRetention ?? initialAppRef.current.targetRetention)))
    : !shallowEqual(local, settings) ||
      app.targetRetention !== persistedTargetRetentionRef.current;

  const isDefault =
    shallowEqual(local, DEFAULT_SR_SETTINGS) &&
    app.targetRetention === DEFAULT_APP_SETTINGS.targetRetention;

  const value = useMemo<SettingsContextValue>(
    () => ({
      subjectId,
      subjectName,
      isSubjectMode: !!subjectId,
      overridesEnabled,
      setOverridesEnabled,
      local,
      setLocal,
      app,
      setApp,
      tts,
      setTts,
      voices,
      categories,
      subcategories,
      categoryRecords,
      cardCountByCategory,
      addCategory,
      renameCategory,
      deleteCategory,
      hasChanges,
      isDefault,
      handleSave,
      handleReset,
    }),
    [
      subjectId,
      subjectName,
      overridesEnabled,
      local,
      app,
      tts,
      voices,
      categories,
      subcategories,
      categoryRecords,
      cardCountByCategory,
      addCategory,
      renameCategory,
      deleteCategory,
      hasChanges,
      isDefault,
      handleSave,
      handleReset,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

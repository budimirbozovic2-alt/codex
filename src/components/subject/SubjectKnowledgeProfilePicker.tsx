import { useState, useCallback } from "react";
import { Brain, BookOpen } from "lucide-react";
import { toast } from "sonner";
import {
  KNOWLEDGE_PROFILE_HINTS,
  KNOWLEDGE_PROFILE_LABELS,
  KNOWLEDGE_PROFILE_PRESETS,
  type KnowledgeProfile,
  loadSubjectSettings,
  saveSubjectSettings,
} from "@/domains/subjects/subject-settings";
import { cn } from "@/lib/utils";

interface Props {
  categoryId: string;
  /** Hide helper copy when embedded in a denser dialog. */
  compact?: boolean;
}

export function SubjectKnowledgeProfilePicker({ categoryId, compact }: Props) {
  const [active, setActive] = useState<KnowledgeProfile>(() =>
    loadSubjectSettings(categoryId)?.knowledgeProfile ?? "conceptual",
  );

  const handleSelect = useCallback(async (profile: KnowledgeProfile) => {
    if (profile === active) return;
    const preset = KNOWLEDGE_PROFILE_PRESETS[profile];
    try {
      await saveSubjectSettings(categoryId, {
        ...loadSubjectSettings(categoryId),
        knowledgeProfile: profile,
        targetRetention: preset.targetRetention,
        leechThreshold: preset.leechThreshold,
      });
      setActive(profile);
      toast.success(`FSRS profil: ${KNOWLEDGE_PROFILE_LABELS[profile]}`);
    } catch {
      toast.error("Snimanje FSRS profila nije uspjelo.");
    }
  }, [active, categoryId]);

  return (
    <div className="space-y-2">
      {!compact && (
        <p className="text-xs text-muted-foreground">
          Ovaj predmet je više{" "}
          <strong className="text-foreground">memorijski</strong> (fakti, definicije) ili{" "}
          <strong className="text-foreground">konceptualni</strong> (eseji, razumijevanje)?
          Podešava target retenciju i leech prag.
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(["memory", "conceptual"] as const).map((profile) => {
          const selected = active === profile;
          const Icon = profile === "memory" ? Brain : BookOpen;
          return (
            <button
              key={profile}
              type="button"
              onClick={() => void handleSelect(profile)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-accent/30",
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={cn("h-4 w-4", selected ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm font-medium">{KNOWLEDGE_PROFILE_LABELS[profile]}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {KNOWLEDGE_PROFILE_HINTS[profile]}
              </p>
              <p className="text-[10px] text-muted-foreground/80 mt-1 tabular-nums">
                Retencija {(KNOWLEDGE_PROFILE_PRESETS[profile].targetRetention! * 100).toFixed(0)}%
                {" · "}Leech ≥ {KNOWLEDGE_PROFILE_PRESETS[profile].leechThreshold}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

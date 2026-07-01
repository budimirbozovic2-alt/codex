import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SlidersHorizontal, AlertTriangle, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ExaminerProfile } from "@/lib/db-types";
import type { Card, SRSettings } from "@/lib/spaced-repetition";
import { buildQuery } from "@/lib/url-params";
import { afterDialogClose } from "@/lib/dialog-utils";
import { useDirtyDialog } from "@/hooks/useDirtyDialog";
import DirtyConfirmBar from "@/components/ui/dirty-confirm-bar";
import { SubjectKnowledgeProfilePicker } from "@/components/subject/SubjectKnowledgeProfilePicker";
import { ExaminerProfileFields } from "@/components/subject/ExaminerProfileFields";
import { useExaminerProfileEditor } from "@/components/subject/useExaminerProfileEditor";
import { LeechInboxPanel } from "@/components/review/LeechInboxPanel";
import { DueForecastWidget } from "@/components/dashboard/DueForecastWidget";
import { cn } from "@/lib/utils";

type SettingsTab = "algorithm" | "leech" | "forecast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  cards: Card[];
  srSettings: SRSettings;
  leechCount: number;
  initialProfile?: ExaminerProfile;
  onSaveExaminer: (profile: ExaminerProfile) => void;
}

export function SubjectAlgorithmSettingsDialog({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  cards,
  srSettings,
  leechCount,
  initialProfile,
  onSaveExaminer,
}: Props) {
  const [tab, setTab] = useState<SettingsTab>("algorithm");
  const editor = useExaminerProfileEditor(initialProfile, open);

  useEffect(() => {
    if (open) setTab("algorithm");
  }, [open]);

  const { pendingClose, requestClose, cancelClose, confirmDiscard } = useDirtyDialog(
    editor.isDirty,
    () => onOpenChange(false),
  );

  const handleSaveExaminer = () => {
    const profile = editor.buildProfile();
    onOpenChange(false);
    afterDialogClose(() => {
      onSaveExaminer(profile);
      toast.success("Profil ispitivača sačuvan");
    });
  };

  const tabs: { key: SettingsTab; label: string; icon: typeof SlidersHorizontal; badge?: number }[] = [
    { key: "algorithm", label: "Algoritam", icon: SlidersHorizontal },
    { key: "leech", label: "Leech", icon: AlertTriangle, badge: leechCount },
    { key: "forecast", label: "Prognoza", icon: CalendarClock },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) requestClose(); else onOpenChange(true); }}>
      <DialogContent
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => { if (editor.isDirty) { e.preventDefault(); requestClose(); } }}
        onEscapeKeyDown={(e) => { if (editor.isDirty) { e.preventDefault(); requestClose(); } }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            Podešavanja predmeta
          </DialogTitle>
          <DialogDescription>
            Algoritam, leech, prognoza i ispitivač za{" "}
            <span className="text-foreground font-medium">{categoryName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 p-1 rounded-lg bg-muted/40 border border-border/50">
          {tabs.map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
                tab === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", key === "leech" && leechCount > 0 && "text-destructive")} />
              <span>{label}</span>
              {badge != null && badge > 0 && (
                <span className="tabular-nums text-[10px] text-destructive font-semibold">({badge})</span>
              )}
            </button>
          ))}
        </div>

        <div className="py-1 min-h-[12rem]">
          {tab === "algorithm" && (
            <div className="space-y-6">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tip predmeta
                </h3>
                <SubjectKnowledgeProfilePicker categoryId={categoryId} compact />
              </section>

              <div className="border-t border-border/60" />

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Profil ispitivača
                </h3>
                <ExaminerProfileFields editor={editor} />
              </section>

              <Button asChild variant="link" className="h-auto p-0 text-xs">
                <Link to={`/settings${buildQuery({ tab: "algorithm", category: categoryId })}`}>
                  Napredna FSRS podešavanja →
                </Link>
              </Button>
            </div>
          )}

          {tab === "leech" && (
            <LeechInboxPanel
              cards={cards}
              srSettings={srSettings}
              categoryId={categoryId}
              maxItems={8}
              variant="embedded"
            />
          )}

          {tab === "forecast" && (
            <DueForecastWidget cards={cards} variant="embedded" />
          )}
        </div>

        {tab === "algorithm" ? (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => requestClose()}>Zatvori</Button>
            <Button onClick={handleSaveExaminer} disabled={!editor.isDirty}>
              Sačuvaj ispitivača
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button variant="ghost" onClick={() => requestClose()}>Zatvori</Button>
          </DialogFooter>
        )}

        <DirtyConfirmBar
          open={pendingClose}
          onCancel={cancelClose}
          onDiscard={confirmDiscard}
          onSave={async () => { handleSaveExaminer(); }}
        />
      </DialogContent>
    </Dialog>
  );
}

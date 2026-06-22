import { SubjectKnowledgeProfilePicker } from "@/components/subject/SubjectKnowledgeProfilePicker";

interface Props {
  categoryId: string;
}

/** @deprecated Dashboard koristi SubjectAlgorithmSettingsDialog; ostaje za reuse u testovima. */
export function SubjectFsrsProfileCard({ categoryId }: Props) {
  return (
    <section className="space-y-3" aria-label="FSRS profil predmeta">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        FSRS profil predmeta
      </h2>
      <div className="glass-card rounded-xl p-4 border border-border/60">
        <SubjectKnowledgeProfilePicker categoryId={categoryId} />
      </div>
    </section>
  );
}

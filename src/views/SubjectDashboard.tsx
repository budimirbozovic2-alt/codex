import { useParams, Link } from "react-router-dom";
import { useCategoryData } from "@/contexts/AppContext";
import { useMemo } from "react";
import { ArrowLeft, GraduationCap } from "lucide-react";

export default function SubjectDashboard() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { categoryRecords } = useCategoryData();

  const categoryName = useMemo(() => {
    const rec = categoryRecords.find(r => r.id === categoryId);
    return rec?.name ?? "Nepoznat predmet";
  }, [categoryRecords, categoryId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          aria-label="Nazad na početnu"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-foreground">{categoryName}</h1>
      </div>

      <div className="glass-card rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Učenje</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Ova sekcija će sadržavati alate za učenje iz predmeta <strong>{categoryName}</strong>.
        </p>
      </div>
    </div>
  );
}

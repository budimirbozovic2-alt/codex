import { useParams, Link } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MnemonicModule } from "@/features/mnemonic";
import { ArrowLeft } from "lucide-react";

export default function SubjectMnemonicPage() {
  const { categoryId } = useParams<{ categoryId: string }>();

  return (
    <div>
      <div className="mb-3">
        <Link
          to={`/subject/${categoryId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Nazad na predmet
        </Link>
      </div>
      <ErrorBoundary label="Memo radionica">
        <MnemonicModule />
      </ErrorBoundary>
    </div>
  );
}

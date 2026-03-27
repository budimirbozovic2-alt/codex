import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function RomanForumPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex items-center gap-3 mb-8">
        <Link
          to="/"
          className="p-2 rounded-md hover:bg-secondary text-muted-foreground transition-colors"
          aria-label="Nazad"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1
          className="text-2xl font-bold tracking-[0.15em] text-foreground"
          style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
        >
          FORVM IVSTITIAE
        </h1>
      </div>

      <div className="flex items-center justify-center min-h-[50vh] rounded-xl border border-dashed border-border">
        <p className="text-muted-foreground text-sm italic">
          Monumenta aedificantur… (Phase 2)
        </p>
      </div>
    </div>
  );
}

import { Brain, Palette, Database, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import InfoPanel from "@/components/InfoPanel";

const SECTIONS = [
  {
    to: "/settings/learning",
    icon: Brain,
    title: "Učenje i memorija",
    description: "FSRS, ciljna retencija, dnevni cilj i težine kognitivnog otpora",
  },
  {
    to: "/settings/app",
    icon: Palette,
    title: "Aplikacija",
    description: "Tema, dashboard, zvuk, TTS, pomodoro i podsjetnici",
  },
  {
    to: "/settings/data",
    icon: Database,
    title: "Podaci i sistem",
    description: "Backup, predmeti, ažuriranja i zdravlje baze",
  },
] as const;

export default function SettingsHub() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="imperial-title">Podešavanja</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Odaberi oblast koju želiš prilagoditi
          </p>
        </div>
        <InfoPanel title="O podešavanjima">
          <p><strong className="text-foreground">Učenje</strong> — FSRS v5, retencija, dnevni cilj.</p>
          <p><strong className="text-foreground">Aplikacija</strong> — izgled, dashboard widgeti, sesija.</p>
          <p><strong className="text-foreground">Podaci</strong> — backup, struktura predmeta, ažuriranja.</p>
          <p className="text-xs text-muted-foreground pt-2">
            Za override po predmetu otvori predmet → Podešavanja.
          </p>
        </InfoPanel>
      </div>

      <div className="space-y-3">
        {SECTIONS.map(({ to, icon: Icon, title, description }) => (
          <Link
            key={to}
            to={to}
            className="glass-card hover-lift pressable rounded-xl p-5 flex items-center gap-4 group"
          >
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0 transition-colors group-hover:bg-primary/15">
              <Icon className="h-5 w-5" strokeWidth={1.6} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-foreground">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
          </Link>
        ))}
      </div>

      <div className="pb-8" />
    </div>
  );
}

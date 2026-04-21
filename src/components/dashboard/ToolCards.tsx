import { Gauge, BarChart3 } from "lucide-react";
import { Link } from "react-router-dom";
import { memo } from "react";

const cards = [
  {
    to: "/planner",
    icon: Gauge,
    title: "Strateški planer",
    desc: "Planiraj tempo i prioritete",
  },
  {
    to: "/stats",
    icon: BarChart3,
    title: "Statistika",
    desc: "Pregled napretka i analitika",
  },
] as const;

export const ToolCards = memo(function ToolCards() {
  return (
    <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-3 duration-300"
      style={{ animationDelay: "80ms", animationFillMode: "both" }}>
      {cards.map(({ to, icon: Icon, title, desc }) => (
        <Link
          key={to}
          to={to}
          className="glass-card rounded-xl p-5 flex items-start gap-4 hover:border-primary/40 transition-all group"
        >
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0 group-hover:bg-primary/15 transition-colors">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
          </div>
        </Link>
      ))}
    </div>
  );
});

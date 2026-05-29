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
    <div className="grid grid-cols-2 gap-3 animate-fade-up"
      style={{ animationDelay: "80ms" }}>
      {cards.map(({ to, icon: Icon, title, desc }) => (
        <Link
          key={to}
          to={to}
          className="glass-card hover-lift pressable rounded-xl p-5 flex items-start gap-4 hover:border-primary/40 group h-full"
        >
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0 transition-colors duration-200 group-hover:bg-primary/15 group-hover:scale-105">
            <Icon className="h-5 w-5" strokeWidth={1.6} />
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

import { BookOpen, Sparkles, Zap } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TabValue } from "@/views/subject-cards/types";

interface SubjectCardsTabsProps {
  tab: TabValue;
  onTabChange: (value: string) => void;
  children: React.ReactNode;
}

export default function SubjectCardsTabs({ tab, onTabChange, children }: SubjectCardsTabsProps) {
  return (
    <Tabs value={tab} onValueChange={onTabChange} className="w-full space-y-4">
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
          Učenje
        </p>
        <TabsList className="w-full h-auto bg-transparent p-0 grid grid-cols-2 gap-3">
          <TabsTrigger
            value="read"
            className="relative w-full justify-start text-left h-auto rounded-xl p-5 gap-4 border-2 border-primary/50 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 hover:border-primary hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-0.5 transition-all data-[state=active]:border-primary data-[state=active]:shadow-xl data-[state=active]:shadow-primary/20 group"
          >
            <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" />
              Preporučeno
            </span>
            <div className="p-3 rounded-lg shrink-0 bg-primary text-primary-foreground shadow-lg shadow-primary/30 group-hover:bg-primary/90 transition-colors">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-base text-foreground">Pasivno čitanje</p>
              <p className="text-xs text-muted-foreground mt-1 whitespace-normal">
                Slušanje i čitanje sadržaja kartica bez ocjenjivanja
              </p>
            </div>
          </TabsTrigger>

          <TabsTrigger
            value="speed"
            className="relative w-full justify-start text-left h-auto rounded-xl p-5 gap-4 border-2 border-primary/50 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 hover:border-primary hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-0.5 transition-all data-[state=active]:border-primary data-[state=active]:shadow-xl data-[state=active]:shadow-primary/20 group"
          >
            <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <Zap className="h-3 w-3" />
              Brzo
            </span>
            <div className="p-3 rounded-lg shrink-0 bg-primary text-primary-foreground shadow-lg shadow-primary/30 group-hover:bg-primary/90 transition-colors">
              <Zap className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-base text-foreground">Brzo čitanje</p>
              <p className="text-xs text-muted-foreground mt-1 whitespace-normal">
                RSVP brzo čitanje kartica — treniraj brzinu i fokus
              </p>
            </div>
          </TabsTrigger>
        </TabsList>
      </div>

      {children}
    </Tabs>
  );
}

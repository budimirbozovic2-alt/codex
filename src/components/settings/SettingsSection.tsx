import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
  id?: string;
  className?: string;
}

export default function SettingsSection({ title, description, children, id, className }: Props) {
  return (
    <section
      id={id}
      className={cn("rounded-lg border border-border/60 overflow-hidden bg-card/30", className)}
    >
      <div className="sticky top-0 z-10 px-4 py-2.5 bg-background/95 backdrop-blur border-b border-border/60">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {description && (
          <p className="text-xs text-muted-foreground/80 mt-0.5">{description}</p>
        )}
      </div>
      <div className="px-4 divide-y divide-border/50">{children}</div>
    </section>
  );
}

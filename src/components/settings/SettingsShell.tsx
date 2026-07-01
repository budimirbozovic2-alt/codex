import type { ReactNode } from "react";
import SettingsNavSidebar from "@/components/settings/SettingsNavSidebar";
import { useSettingsContext } from "@/components/settings/SettingsContext";

interface Props {
  children: ReactNode;
}

export default function SettingsShell({ children }: Props) {
  const { isSubjectMode } = useSettingsContext();

  if (isSubjectMode) {
    return <>{children}</>;
  }

  return (
    <div className="flex -mx-4 md:-mx-8 min-h-[calc(100vh-8rem)]">
      <SettingsNavSidebar />
      <main className="flex-1 min-w-0 overflow-y-auto border-l border-border/60">
        <div className="max-w-3xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}

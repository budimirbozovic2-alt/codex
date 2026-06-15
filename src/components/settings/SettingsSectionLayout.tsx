import type { ReactNode } from "react";
import SettingsFormFooter from "@/components/settings/SettingsFormFooter";

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
  showFooter?: boolean;
}

export default function SettingsSectionLayout({
  title,
  description,
  children,
  showFooter = true,
}: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children}
      {showFooter && <SettingsFormFooter />}
    </div>
  );
}

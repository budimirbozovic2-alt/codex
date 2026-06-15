import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import SettingsFormFooter from "@/components/settings/SettingsFormFooter";

interface Props {
  title: string;
  description: string;
  backTo?: string;
  backLabel?: string;
  subNav?: ReactNode;
  children: ReactNode;
  showFooter?: boolean;
}

export default function SettingsSectionLayout({
  title,
  description,
  backTo = "/settings",
  backLabel = "Sva podešavanja",
  subNav,
  children,
  showFooter = true,
}: Props) {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        title={title}
        subtitle={description}
        back={{ label: backLabel, onClick: () => navigate(backTo) }}
      />

      {subNav}

      {children}

      {showFooter && <SettingsFormFooter />}
      <div className="pb-8" />
    </div>
  );
}

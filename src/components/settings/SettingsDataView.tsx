import { Navigate, useLocation } from "react-router-dom";
import SubjectsTab from "@/components/settings/SubjectsTab";
import SystemTab from "@/components/settings/SystemTab";
import SettingsSectionLayout from "@/components/settings/SettingsSectionLayout";
import { useSettingsContext } from "@/components/settings/SettingsProvider";

export default function SettingsDataView() {
  const {
    isSubjectMode,
    categories,
    subcategories,
    categoryRecords,
    cardCountByCategory,
    addCategory,
    renameCategory,
    deleteCategory,
  } = useSettingsContext();
  const location = useLocation();

  if (isSubjectMode) {
    return <Navigate to={`/settings/learning${location.search}`} replace />;
  }

  return (
    <SettingsSectionLayout
      title="Podaci i sistem"
      description="Backup, struktura predmeta, ažuriranja i zdravlje baze"
      showFooter={false}
    >
      <div className="space-y-8">
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Predmeti i struktura
          </h3>
          <SubjectsTab
            categories={categories}
            subcategories={subcategories}
            categoryRecords={categoryRecords}
            cardCountByCategory={cardCountByCategory}
            onAdd={addCategory}
            onRename={renameCategory}
            onDelete={deleteCategory}
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Backup, ažuriranja i zdravlje
          </h3>
          <SystemTab />
        </section>
      </div>
    </SettingsSectionLayout>
  );
}

import { Navigate, useLocation } from "react-router-dom";
import SubjectsTab from "@/components/settings/SubjectsTab";
import SystemTab from "@/components/settings/SystemTab";
import SettingsSectionLayout from "@/components/settings/SettingsSectionLayout";
import SettingsSection from "@/components/settings/SettingsSection";
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
        <SettingsSection
          id="subjects"
          title="Predmeti i struktura"
          description="Dodaj, preimenuj ili ukloni predmete."
        >
          <SubjectsTab
            categories={categories}
            subcategories={subcategories}
            categoryRecords={categoryRecords}
            cardCountByCategory={cardCountByCategory}
            onAdd={addCategory}
            onRename={renameCategory}
            onDelete={deleteCategory}
          />
        </SettingsSection>

        <SystemTab />
      </div>
    </SettingsSectionLayout>
  );
}

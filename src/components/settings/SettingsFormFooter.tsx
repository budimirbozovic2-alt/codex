import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsContext } from "@/components/settings/SettingsContext";

export default function SettingsFormFooter() {
  const { isSubjectMode, overridesEnabled, hasChanges, isDefault, handleSave, handleReset } =
    useSettingsContext();

  return (
    <div className="flex gap-3 pb-4">
      <Button onClick={() => void handleSave()} disabled={!hasChanges} className="flex-1 h-9">
        {isSubjectMode ? "Sačuvaj za predmet" : "Sačuvaj algoritam"}
      </Button>
      <Button
        onClick={handleReset}
        variant="outline"
        disabled={isSubjectMode ? !overridesEnabled : isDefault}
        className="h-9"
      >
        <RotateCcw className="h-4 w-4 mr-2" />
        {isSubjectMode ? "Globalne vrijednosti" : "Podrazumijevano"}
      </Button>
    </div>
  );
}

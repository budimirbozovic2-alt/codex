import { Search, X } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import CardViewMode from "@/components/category/CardViewMode";
import CardOrgMode from "@/components/category/CardOrgMode";
import PassiveReader from "@/components/subject-cards/PassiveReader";
import LocalSpeedReader from "@/components/subject-cards/LocalSpeedReader";
import ManageModeToolbar from "@/views/subject-cards/ManageModeToolbar";
import { MANAGE_MODE } from "@/views/subject-cards/manageModes";
import type { EditReturnSnapshot } from "@/views/subject-cards/types";
import type { SubjectCardsState } from "@/views/subject-cards/useSubjectCardsState";

type ViewModeRendererProps = Pick<
  SubjectCardsState,
  | "categoryId"
  | "cards"
  | "subcategoryNodes"
  | "categoryRecords"
  | "manageMode"
  | "searchQuery"
  | "pendingPassiveCardId"
  | "pendingSpeedCardId"
  | "initialSnapshot"
  | "cardActions"
  | "setManageMode"
  | "handleOpenStructure"
  | "handleSearchChange"
  | "handleClearSearch"
  | "handleEdit"
  | "handlePassiveRead"
  | "handleCardViewFiltersChange"
  | "handleConsumedPassiveId"
  | "handleConsumedSpeedId"
>;

export default function ViewModeRenderer({
  categoryId,
  cards,
  subcategoryNodes,
  categoryRecords,
  manageMode,
  searchQuery,
  pendingPassiveCardId,
  pendingSpeedCardId,
  initialSnapshot,
  cardActions,
  setManageMode,
  handleOpenStructure,
  handleSearchChange,
  handleClearSearch,
  handleEdit,
  handlePassiveRead,
  handleCardViewFiltersChange,
  handleConsumedPassiveId,
  handleConsumedSpeedId,
}: ViewModeRendererProps) {
  const {
    patchCard,
    setFrequency,
    addCard,
    addFlashCard,
    bulkAddFlashCards,
    deleteCard,
  } = cardActions;

  const filterSnapshot = initialSnapshot as EditReturnSnapshot | null;

  return (
    <>
      <TabsContent value="manage" className="pt-2 space-y-3">
        <ManageModeToolbar
          manageMode={manageMode}
          onChangeMode={setManageMode}
          onOpenStructure={handleOpenStructure}
        />

        {manageMode === MANAGE_MODE.Edit ? (
          <>
            <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-card p-2.5">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Pretraži pitanja, odgovore, tagove..."
                  className="h-8 pl-8 text-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
                    aria-label="Obriši pretragu"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            <CardViewMode
              cards={cards}
              categoryId={categoryId!}
              allCategories={categoryRecords}
              subcategoryNodes={subcategoryNodes}
              patchCard={patchCard}
              setFrequency={setFrequency}
              addCard={addCard}
              addFlashCard={addFlashCard}
              bulkAddFlashCards={bulkAddFlashCards}
              onDelete={deleteCard}
              onEdit={handleEdit}
              onPassiveRead={handlePassiveRead}
              externalQuery={searchQuery}
              initialSubcategory={filterSnapshot?.cvSubcategory}
              initialChapter={filterSnapshot?.cvChapter}
              initialType={filterSnapshot?.cvType}
              initialFrequency={filterSnapshot?.cvFrequency}
              onFiltersChange={handleCardViewFiltersChange}
            />
          </>
        ) : (
          <CardOrgMode
            cards={cards}
            categoryId={categoryId!}
            subcategoryNodes={subcategoryNodes}
            patchCard={patchCard}
          />
        )}
      </TabsContent>

      <TabsContent value="read" className="pt-2">
        <PassiveReader
          cards={cards}
          subcategoryNodes={subcategoryNodes}
          categoryId={categoryId!}
          onEditCard={handleEdit}
          initialCardId={pendingPassiveCardId}
          onInitialConsumed={handleConsumedPassiveId}
        />
      </TabsContent>

      <TabsContent value="speed" className="pt-2">
        <LocalSpeedReader
          cards={cards}
          subcategoryNodes={subcategoryNodes}
          categoryId={categoryId!}
          initialCardId={pendingSpeedCardId}
          onInitialConsumed={handleConsumedSpeedId}
        />
      </TabsContent>
    </>
  );
}

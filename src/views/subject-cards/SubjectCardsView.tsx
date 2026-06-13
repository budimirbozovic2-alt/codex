import CardCreateMenu from "@/components/category/CardCreateMenu";
import StructureManagerDialog from "@/components/category/StructureManagerDialog";
import SubjectHeader from "@/views/subject-cards/SubjectHeader";
import SubjectCardsTabs from "@/views/subject-cards/components/SubjectCardsTabs";
import ViewModeRenderer from "@/views/subject-cards/components/ViewModeRenderer";
import { useSubjectCardsState } from "@/views/subject-cards/useSubjectCardsState";

export default function SubjectCardsView() {
  const state = useSubjectCardsState();
  const {
    categoryId,
    ready,
    category,
    tab,
    allCategoryNames,
    essayCount,
    flashCount,
    structureOpen,
    subcategoryNodes,
    cardActions,
    categoryActions,
    importCards,
    handleBackToManage,
    handleTabChange,
    setStructureOpen,
  } = state;

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!category) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Predmet nije pronađen.
      </div>
    );
  }

  const { addCard, addFlashCard, bulkAddFlashCards } = cardActions;
  const {
    addSubcategory,
    renameSubcategory,
    deleteSubcategory,
    addChapter,
    renameChapter,
    deleteChapter,
    reorderSubcategories,
    reorderChapters,
  } = categoryActions;

  return (
    <div className="space-y-6">
      <SubjectHeader
        categoryId={categoryId!}
        categoryName={category.name}
        essayCount={essayCount}
        flashCount={flashCount}
        tab={tab}
        onBackToManage={handleBackToManage}
        createMenuSlot={
          tab === "manage" ? (
            <CardCreateMenu
              size="icon"
              categoryId={categoryId!}
              allCategoryNames={allCategoryNames}
              addCard={addCard}
              addFlashCard={addFlashCard}
              bulkAddFlashCards={bulkAddFlashCards}
              importEssays={importCards}
            />
          ) : null
        }
      />

      <SubjectCardsTabs tab={tab} onTabChange={handleTabChange}>
        <ViewModeRenderer {...state} />
      </SubjectCardsTabs>

      <StructureManagerDialog
        open={structureOpen}
        onOpenChange={setStructureOpen}
        categoryId={categoryId!}
        categoryName={category.name}
        subcategoryNodes={subcategoryNodes}
        onAddSubcategory={addSubcategory}
        onRenameSubcategory={renameSubcategory}
        onDeleteSubcategory={deleteSubcategory}
        onReorderSubcategories={reorderSubcategories}
        onAddChapter={addChapter}
        onRenameChapter={renameChapter}
        onDeleteChapter={deleteChapter}
        onReorderChapters={reorderChapters}
      />
    </div>
  );
}

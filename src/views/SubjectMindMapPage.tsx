import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { MindMapDoc } from "@/lib/db";
import MindMapList from "@/components/mindmap/MindMapList";
import MindMapCanvas from "@/components/mindmap/MindMapCanvas";
import { hasSeenOnboarding } from "@/components/mindmap/MindMapOnboarding";
import { ArrowLeft } from "lucide-react";

export default function SubjectMindMapPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [activeDoc, setActiveDoc] = useState<MindMapDoc | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());

  if (activeDoc) {
    return (
      <div className="h-[calc(100vh-3rem)]">
        <MindMapCanvas doc={activeDoc} onBack={() => setActiveDoc(null)} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <Link
          to={`/subject/${categoryId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Nazad na predmet
        </Link>
      </div>
      <MindMapList
        onOpen={setActiveDoc}
        showOnboarding={showOnboarding}
        onShowOnboarding={() => setShowOnboarding(true)}
        onCloseOnboarding={() => setShowOnboarding(false)}
      />
    </div>
  );
}

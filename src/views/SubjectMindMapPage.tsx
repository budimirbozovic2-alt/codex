import { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import type { MindMapDoc } from "@/lib/db-types";
import MindMapList from "@/components/mindmap/MindMapList";
import MindMapCanvas from "@/components/mindmap/MindMapCanvas";
import { hasSeenOnboarding } from "@/components/mindmap/MindMapOnboarding";
import { useMindMaps } from "@/hooks/useMindMaps";
import { ArrowLeft } from "lucide-react";

export default function SubjectMindMapPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeDoc, setActiveDoc] = useState<MindMapDoc | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());

  const { mindMaps } = useMindMaps();

  // Auto-open a mind map when arriving with ?open={id}
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId || activeDoc || mindMaps.length === 0) return;
    const target = mindMaps.find(d => d.id === openId);
    if (target) {
      setActiveDoc(target);
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, activeDoc, setSearchParams, mindMaps]);

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

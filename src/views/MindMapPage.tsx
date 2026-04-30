import { useState } from "react";
import type { MindMapDoc } from "@/lib/db";
import MindMapList from "@/components/mindmap/MindMapList";
import MindMapCanvas from "@/components/mindmap/MindMapCanvas";
import { hasSeenOnboarding } from "@/components/mindmap/MindMapOnboarding";

export default function MindMapPage() {
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
    <MindMapList
      onOpen={setActiveDoc}
      showOnboarding={showOnboarding}
      onShowOnboarding={() => setShowOnboarding(true)}
      onCloseOnboarding={() => setShowOnboarding(false)}
    />
  );
}

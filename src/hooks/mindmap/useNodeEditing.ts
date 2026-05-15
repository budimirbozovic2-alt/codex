import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { MindMapNodeData } from "@/components/mindmap/node/icon-registry";

/**
 * Encapsulates the inline-editing lifecycle for a mind-map node:
 *   - draft label/description state (commit-on-blur, revert-on-escape)
 *   - external-data sync when NOT editing (so other clients' updates land)
 *   - outside-click detection (closes & commits)
 *   - stopPropagation helper for inputs (so node drag doesn't fire)
 *
 * Single hook replaces 4 useState + 2 useEffect blocks scattered across the
 * old 390-line MindMapNode component. Behavior is unchanged.
 */
export function useNodeEditing(
  id: string,
  nodeData: MindMapNodeData,
): {
  nodeRef: RefObject<HTMLDivElement>;
  editing: boolean;
  startEditing: () => void;
  draftLabel: string;
  setDraftLabel: (v: string) => void;
  draftDesc: string;
  setDraftDesc: (v: string) => void;
  commitAndClose: () => void;
  cancelEditing: () => void;
  stopPropagation: (e: React.MouseEvent | React.PointerEvent) => void;
} {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(nodeData.label);
  const [draftDesc, setDraftDesc] = useState(nodeData.description || "");

  // Sync drafts when external data changes (and not editing locally).
  useEffect(() => {
    if (!editing) {
      setDraftLabel(nodeData.label);
      setDraftDesc(nodeData.description || "");
    }
  }, [nodeData.label, nodeData.description, editing]);

  const commitAndClose = useCallback(() => {
    nodeData.onUpdate?.(id, { label: draftLabel, description: draftDesc });
    setEditing(false);
  }, [id, nodeData, draftLabel, draftDesc]);

  const cancelEditing = useCallback(() => {
    setDraftLabel(nodeData.label);
    setDraftDesc(nodeData.description || "");
    setEditing(false);
  }, [nodeData.label, nodeData.description]);

  // Outside-click detection: close & commit when clicking outside the node.
  useEffect(() => {
    if (!editing) return;
    const handler = (e: PointerEvent) => {
      if (nodeRef.current && !nodeRef.current.contains(e.target as Node)) {
        commitAndClose();
      }
    };
    // Capture + slight delay so the click that starts editing doesn't immediately close it.
    const timer = setTimeout(() => {
      document.addEventListener("pointerdown", handler, true);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", handler, true);
    };
  }, [editing, commitAndClose]);

  const stopPropagation = useCallback((e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
  }, []);

  const startEditing = useCallback(() => setEditing(true), []);

  return {
    nodeRef,
    editing,
    startEditing,
    draftLabel,
    setDraftLabel,
    draftDesc,
    setDraftDesc,
    commitAndClose,
    cancelEditing,
    stopPropagation,
  };
}

/* eslint-disable react-refresh/only-export-components --
 * Module bundles SnapGuideLines (component) + autoLayout (pure layout fn).
 * Both are mind-map editor utilities consumed only by mindmap views; HMR
 * boundary loss inside the editor is acceptable.
 */
import { useReactFlow, type Node, type Edge } from "@xyflow/react";

// ── Snap guide lines ──
export function SnapGuideLines({ snapLines }: { snapLines: { x?: number; y?: number } }) {
  const { getViewport } = useReactFlow();
  if (snapLines.x === undefined && snapLines.y === undefined) return null;
  const { x: tx, y: ty, zoom } = getViewport();
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1000 }}>
      {snapLines.x !== undefined && (
        <line x1={snapLines.x * zoom + tx} y1={0} x2={snapLines.x * zoom + tx} y2={9999}
          stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="6 3" opacity={0.5} />
      )}
      {snapLines.y !== undefined && (
        <line x1={0} y1={snapLines.y * zoom + ty} x2={9999} y2={snapLines.y * zoom + ty}
          stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="6 3" opacity={0.5} />
      )}
    </svg>
  );
}

// ── Auto-Layout (simple layered/dagre-like) ──
export function autoLayout(nodes: Node[], edges: Edge[], direction: "TB" | "LR" = "TB"): Node[] {
  if (nodes.length === 0) return nodes;
  const NODE_W = 200, NODE_H = 80, GAP_X = 80, GAP_Y = 100;
  const isHorizontal = direction === "LR";

  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  nodes.forEach(n => childrenOf.set(n.id, []));
  edges.forEach(e => { childrenOf.get(e.source)?.push(e.target); hasParent.add(e.target); });

  const roots = nodes.filter(n => !hasParent.has(n.id));
  if (roots.length === 0) roots.push(nodes[0]);

  const layer = new Map<string, number>();
  const queue = roots.map(r => ({ id: r.id, lvl: 0 }));
  const visited = new Set<string>();
  while (queue.length > 0) {
    const { id, lvl } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    layer.set(id, lvl);
    for (const child of (childrenOf.get(id) || [])) queue.push({ id: child, lvl: lvl + 1 });
  }
  nodes.forEach(n => { if (!layer.has(n.id)) layer.set(n.id, Math.max(...layer.values()) + 1); });

  const layers = new Map<number, string[]>();
  layer.forEach((lvl, id) => { if (!layers.has(lvl)) layers.set(lvl, []); layers.get(lvl)!.push(id); });

  const posMap = new Map<string, { x: number; y: number }>();
  [...layers.entries()].sort((a, b) => a[0] - b[0]).forEach(([lvl, ids]) => {
    const total = ids.length * (isHorizontal ? NODE_H + GAP_Y : NODE_W + GAP_X) - (isHorizontal ? GAP_Y : GAP_X);
    const start = -total / 2;
    ids.forEach((id, idx) => {
      posMap.set(id, isHorizontal
        ? { x: lvl * (NODE_W + GAP_X), y: start + idx * (NODE_H + GAP_Y) }
        : { x: start + idx * (NODE_W + GAP_X), y: lvl * (NODE_H + GAP_Y) });
    });
  });

  return nodes.map(n => ({ ...n, position: posMap.get(n.id) || n.position }));
}

import { z } from "zod";
import { sanitizeHtml } from "@/lib/sanitize";
import type { MindMapDoc } from "@/lib/db-types";
import { SafeText, NumberWithDefault } from "./helpers";

const MindMapNodeSchema = z
  .object({
    id: z.string(),
    type: z.unknown().optional(),
    position: z.unknown().optional().transform((v) => (v && typeof v === "object" ? v : { x: 0, y: 0 })),
    data: z.unknown().optional().transform((v) => {
      if (!v || typeof v !== "object") return {};
      const obj = v as Record<string, unknown>;
      const out: Record<string, unknown> = { ...obj };
      if (typeof obj.label === "string") out.label = sanitizeHtml(obj.label);
      if (typeof obj.description === "string") out.description = sanitizeHtml(obj.description);
      return out;
    }),
    style: z.unknown().optional(),
  })
  .strict();

const MindMapEdgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
  })
  .strict();

export const BackupMindMapSchema = z
  .object({
    id: z.string(),
    categoryId: z.unknown().optional(),
    title: SafeText,
    mode: z.unknown().optional().transform((v) => (v === "procedure" ? "procedure" : "hierarchy")),
    nodes: z.array(MindMapNodeSchema).default([]),
    edges: z.array(MindMapEdgeSchema).default([]),
    createdAt: NumberWithDefault(Date.now()),
    updatedAt: NumberWithDefault(Date.now()),
  })
  .strict()
  .transform((m): MindMapDoc => {
    return {
      id: m.id,
      categoryId: typeof m.categoryId === "string" ? m.categoryId : "",
      title: m.title,
      mode: m.mode,
      nodes: m.nodes as MindMapDoc["nodes"],
      edges: m.edges as MindMapDoc["edges"],
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  });

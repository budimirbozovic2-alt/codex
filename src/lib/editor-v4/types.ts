import type { JSONContent } from "@tiptap/core";

/**
 * V4 editor document — the canonical AST representation.
 *
 * `content` is the ProseMirror JSON root (`{ type: "doc", content: [...] }`).
 * `version` enables future migrations without breaking older payloads.
 */
export interface EditorDoc {
  readonly version: 4;
  readonly content: JSONContent;
}

export type { JSONContent };

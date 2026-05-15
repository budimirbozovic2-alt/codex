import {
  Scale, FileText, Building2, Calendar, OctagonX, RefreshCw, User, Coins,
  ArrowRight, CheckCircle2, AlertTriangle, HelpCircle, Clock, Gavel,
  BookOpen, ShieldCheck, Send, Sparkles,
} from "lucide-react";

/**
 * Mind-map node icon catalog. Single source of truth — `MindMapNode`
 * and the settings panel both render from this array, so adding/removing
 * an icon happens in exactly one place.
 */
export const ICON_REGISTRY: { value: string; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { value: "scale", label: "Sud/Pravda", Icon: Scale },
  { value: "file-text", label: "Podnesak/Akt", Icon: FileText },
  { value: "building", label: "Organ/Vlast", Icon: Building2 },
  { value: "calendar", label: "Rok/Datum", Icon: Calendar },
  { value: "octagon-x", label: "Prekid/Kraj", Icon: OctagonX },
  { value: "refresh", label: "Žalba/Ponavljanje", Icon: RefreshCw },
  { value: "user", label: "Stranka/Zastupnik", Icon: User },
  { value: "coins", label: "Troškovi", Icon: Coins },
  { value: "arrow-right", label: "Korak", Icon: ArrowRight },
  { value: "check", label: "Završeno", Icon: CheckCircle2 },
  { value: "alert", label: "Upozorenje", Icon: AlertTriangle },
  { value: "question", label: "Odluka", Icon: HelpCircle },
  { value: "clock", label: "Vrijeme", Icon: Clock },
  { value: "gavel", label: "Presuda", Icon: Gavel },
  { value: "book", label: "Zakon/Propis", Icon: BookOpen },
  { value: "shield", label: "Zaštita", Icon: ShieldCheck },
  { value: "send", label: "Dostava", Icon: Send },
  { value: "sparkles", label: "Posebno", Icon: Sparkles },
];

export const COLOR_OPTIONS = [
  { value: "default", bg: "bg-card", border: "border-border", text: "text-foreground", glow: "" },
  { value: "blue", bg: "bg-node-blue/10", border: "border-node-blue/30", text: "text-node-blue", glow: "shadow-node-blue/20" },
  { value: "green", bg: "bg-node-green/10", border: "border-node-green/30", text: "text-node-green", glow: "shadow-node-green/20" },
  { value: "amber", bg: "bg-node-amber/10", border: "border-node-amber/30", text: "text-node-amber", glow: "shadow-node-amber/20" },
  { value: "red", bg: "bg-node-red/10", border: "border-node-red/30", text: "text-node-red", glow: "shadow-node-red/20" },
  { value: "purple", bg: "bg-node-purple/10", border: "border-node-purple/30", text: "text-node-purple", glow: "shadow-node-purple/20" },
  { value: "cyan", bg: "bg-info/10", border: "border-info/30", text: "text-info", glow: "shadow-info/20" },
  { value: "pink", bg: "bg-node-purple/10", border: "border-node-purple/30", text: "text-node-purple", glow: "shadow-node-purple/20" },
];

export type NodeShape = "rectangle" | "rounded" | "diamond" | "group";

export type MindMapNodeData = {
  label: string;
  description?: string;
  icon?: string;
  color?: string;
  shape?: NodeShape;
  onUpdate?: (id: string, data: Partial<MindMapNodeData>) => void;
  onDuplicate?: (id: string) => void;
};

export function pickColor(color: string | undefined) {
  return COLOR_OPTIONS.find((c) => c.value === (color || "default")) || COLOR_OPTIONS[0];
}

export function pickIcon(icon: string | undefined) {
  return ICON_REGISTRY.find((i) => i.value === (icon || "file-text"));
}

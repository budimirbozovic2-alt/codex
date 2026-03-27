import { ArrowLeft, Search, HelpCircle, ListOrdered } from "lucide-react";
import React from "react";

interface HeaderProps {
  title: string;
  subtitle: string;
  onBack: () => void;
  reorderMode?: boolean;
  onToggleReorder?: () => void;
}

export function Header({ title, subtitle, onBack, reorderMode, onToggleReorder }: HeaderProps) {
  return (
    <div className="flex items-center gap-4">
      <button onClick={onBack} className="p-2 rounded-lg hover:bg-secondary transition-colors">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="flex-1">
        <h2 className="text-2xl font-display">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      {onToggleReorder && (
        <button
          onClick={onToggleReorder}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            reorderMode
              ? "bg-primary text-primary-foreground"
              : "border text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
        >
          <ListOrdered className="h-3.5 w-3.5" />
          {reorderMode ? "Gotovo" : "Redoslijed"}
        </button>
      )}
    </div>
  );
}

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}

export function SearchBar({ value, onChange, placeholder }: SearchBarProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

export function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <HelpCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p>{text}</p>
    </div>
  );
}

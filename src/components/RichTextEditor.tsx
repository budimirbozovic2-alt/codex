import { useRef, useCallback, useEffect } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Paintbrush, Heading2 } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const internalValue = useRef(value);
  const isComposing = useRef(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Sync only when editor is not focused (prevents cursor reset while typing/lists)
    if (document.activeElement !== editor && editor.innerHTML !== value) {
      editor.innerHTML = value;
    }

    internalValue.current = value;
  }, [value]);

  const execCommand = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    if (editorRef.current) {
      internalValue.current = editorRef.current.innerHTML;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleBtn = (cmd: string, val?: string) => () => {
    editorRef.current?.focus();
    execCommand(cmd, val);
  };

  const handleRed = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const parentEl = selection.anchorNode?.parentElement;
    const isRed = parentEl?.style.color === "red" || parentEl?.classList.contains("text-red");

    if (isRed && parentEl && parentEl !== editorRef.current) {
      const text = document.createTextNode(parentEl.textContent || "");
      parentEl.replaceWith(text);
      if (editorRef.current) {
        internalValue.current = editorRef.current.innerHTML;
        onChange(editorRef.current.innerHTML);
      }
    } else {
      editorRef.current?.focus();
      execCommand("foreColor", "#ef4444");
    }
  };

  const handleHeading = () => {
    editorRef.current?.focus();
    execCommand("formatBlock", "h3");
  };

  const handleInput = () => {
    if (isComposing.current) return;
    if (editorRef.current) {
      internalValue.current = editorRef.current.innerHTML;
      onChange(editorRef.current.innerHTML);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  const isEmpty = !value || value === "<br>" || value.replace(/<[^>]*>/g, "").trim() === "";

  const toolbarButtons = [
    { icon: Bold, title: "Bolduj (Ctrl+B)", action: handleBtn("bold") },
    { icon: Italic, title: "Kurziv (Ctrl+I)", action: handleBtn("italic") },
    { icon: Underline, title: "Podvučeno (Ctrl+U)", action: handleBtn("underline") },
    { icon: Heading2, title: "Naslov", action: handleHeading },
    { icon: List, title: "Lista", action: handleBtn("insertUnorderedList") },
    { icon: ListOrdered, title: "Numerisana lista", action: handleBtn("insertOrderedList") },
    { icon: Paintbrush, title: "Crvena boja", action: handleRed, hoverClass: "hover:text-destructive" },
  ];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-0.5 px-1 flex-wrap">
        {toolbarButtons.map(({ icon: Icon, title, action, hoverClass }) => (
          <button
            key={title}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={action}
            className={`p-1.5 rounded-md hover:bg-secondary text-muted-foreground ${hoverClass || "hover:text-foreground"} transition-colors`}
            title={title}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onPaste={handlePaste}
          onCompositionStart={() => { isComposing.current = true; }}
          onCompositionEnd={() => { isComposing.current = false; handleInput(); }}
          suppressContentEditableWarning
          className="min-h-[100px] resize-y overflow-auto rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4"
        />
        {isEmpty && (
          <span className="absolute top-2 left-3 text-sm text-muted-foreground pointer-events-none">
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}

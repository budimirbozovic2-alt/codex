import { useRef, useCallback, useEffect } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import Heading2 from "lucide-react/dist/esm/icons/heading2";
import Bold from "lucide-react/dist/esm/icons/bold";
import Italic from "lucide-react/dist/esm/icons/italic";
import Underline from "lucide-react/dist/esm/icons/underline";
import List from "lucide-react/dist/esm/icons/list";
import ListOrdered from "lucide-react/dist/esm/icons/list-ordered";
import Paintbrush from "lucide-react/dist/esm/icons/paintbrush";
interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minimal?: boolean;
}

/** Try to detect and apply markdown-style formatting in the current text node. */
function tryMarkdownAutoFormat(editor: HTMLDivElement): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;

  const node = sel.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;

  const text = node.textContent || "";
  const offset = sel.anchorOffset;

  // Inline patterns – trigger after closing marker is typed
  // **bold**
  const boldMatch = text.slice(0, offset).match(/\*\*(.+?)\*\*$/);
  if (boldMatch) {
    const start = offset - boldMatch[0].length;
    replaceTextRange(node, start, offset, `<b>${boldMatch[1]}</b>`, editor);
    return true;
  }

  // *italic* (but not **)
  const italicMatch = text.slice(0, offset).match(/(?<!\*)\*([^*]+?)\*$/);
  if (italicMatch) {
    const start = offset - italicMatch[0].length;
    replaceTextRange(node, start, offset, `<i>${italicMatch[1]}</i>`, editor);
    return true;
  }

  // __underline__
  const underlineMatch = text.slice(0, offset).match(/__(.+?)__$/);
  if (underlineMatch) {
    const start = offset - underlineMatch[0].length;
    replaceTextRange(node, start, offset, `<u>${underlineMatch[1]}</u>`, editor);
    return true;
  }

  // ~~strikethrough~~
  const strikeMatch = text.slice(0, offset).match(/~~(.+?)~~$/);
  if (strikeMatch) {
    const start = offset - strikeMatch[0].length;
    replaceTextRange(node, start, offset, `<s>${strikeMatch[1]}</s>`, editor);
    return true;
  }

  // Block-level: at start of a block, after pressing space
  const trimmed = text.slice(0, offset);

  // # Heading (after space)
  if (/^#{1,3}\s$/.test(trimmed)) {
    const parentBlock = getParentBlock(node, editor);
    if (parentBlock) {
      const rest = text.slice(offset);
      const h = document.createElement("h3");
      h.textContent = rest || "\u200B";
      parentBlock.replaceWith(h);
      setCursorEnd(h);
      return true;
    }
  }

  // - or * for unordered list (after space)
  if (/^[-*]\s$/.test(trimmed)) {
    document.execCommand("insertUnorderedList", false);
    // Remove the marker text
    const newSel = window.getSelection();
    if (newSel?.anchorNode) {
      const n = newSel.anchorNode;
      if (n.nodeType === Node.TEXT_NODE && n.textContent) {
        n.textContent = n.textContent.replace(/^[-*]\s/, "");
      }
    }
    return true;
  }

  // 1. for ordered list (after space)
  if (/^\d+\.\s$/.test(trimmed)) {
    document.execCommand("insertOrderedList", false);
    const newSel = window.getSelection();
    if (newSel?.anchorNode) {
      const n = newSel.anchorNode;
      if (n.nodeType === Node.TEXT_NODE && n.textContent) {
        n.textContent = n.textContent.replace(/^\d+\.\s/, "");
      }
    }
    return true;
  }

  return false;
}

function replaceTextRange(node: Node, start: number, end: number, html: string, editor: HTMLDivElement) {
  const text = node.textContent || "";
  const before = text.slice(0, start);
  const after = text.slice(end);

  const span = document.createElement("span");
  span.innerHTML = sanitizeHtml((before || "") + html + (after || ""));

  const parent = node.parentNode;
  if (!parent) return;

  // Replace the text node with new content
  const frag = document.createDocumentFragment();
  while (span.firstChild) frag.appendChild(span.firstChild);
  parent.replaceChild(frag, node);

  // Set cursor after the inserted element
  const sel = window.getSelection();
  if (sel) {
    const range = document.createRange();
    // Find the last inserted node
    const walker = document.createTreeWalker(parent, NodeFilter.SHOW_ALL);
    let last: Node | null = null;
    while (walker.nextNode()) last = walker.currentNode;
    if (last) {
      if (last.nodeType === Node.TEXT_NODE) {
        range.setStart(last, (last.textContent || "").length);
      } else {
        range.setStartAfter(last);
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

function getParentBlock(node: Node, editor: HTMLDivElement): HTMLElement | null {
  let current = node.parentElement;
  while (current && current !== editor) {
    const tag = current.tagName.toLowerCase();
    if (["p", "div", "h1", "h2", "h3", "h4", "li"].includes(tag)) return current;
    current = current.parentElement;
  }
  return null;
}

function setCursorEnd(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export default function RichTextEditor({ value, onChange, placeholder, minimal }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const internalValue = useRef(value);
  const isComposing = useRef(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    if (document.activeElement !== editor && editor.innerHTML !== value) {
      editor.innerHTML = sanitizeHtml(value);
    }

    internalValue.current = value;
  }, [value]);

  const execCommand = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    if (editorRef.current) {
      internalValue.current = editorRef.current.innerHTML;
      onChange(sanitizeHtml(editorRef.current.innerHTML));
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
        onChange(sanitizeHtml(editorRef.current.innerHTML));
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
      // Try markdown auto-formatting
      tryMarkdownAutoFormat(editorRef.current);
      internalValue.current = editorRef.current.innerHTML;
      onChange(sanitizeHtml(editorRef.current.innerHTML));
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    // Smart Image Paste: check for image files in clipboard
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          if (dataUrl && editorRef.current) {
            document.execCommand("insertHTML", false, `<img src="${dataUrl}" style="max-width:100%;border-radius:6px;margin:4px 0;" />`);
            internalValue.current = editorRef.current.innerHTML;
            onChange(sanitizeHtml(editorRef.current.innerHTML));
          }
        };
        reader.readAsDataURL(file);
        return;
      }
    }
    // Plain text paste — use Selection API fallback for reliability
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      // Move cursor after inserted text
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    if (editorRef.current) {
      internalValue.current = editorRef.current.innerHTML;
      onChange(sanitizeHtml(editorRef.current.innerHTML));
    }
  };

  const isEmpty = !value || value === "<br>" || value.replace(/<[^>]*>/g, "").trim() === "";

  const toolbarButtons = [
    { icon: Bold, title: "Bolduj (Ctrl+B)", action: handleBtn("bold"), minimalShow: true },
    { icon: Italic, title: "Kurziv (Ctrl+I)", action: handleBtn("italic"), minimalShow: true },
    { icon: Underline, title: "Podvučeno (Ctrl+U)", action: handleBtn("underline"), minimalShow: false },
    { icon: Heading2, title: "Naslov", action: handleHeading, minimalShow: false },
    { icon: List, title: "Lista", action: handleBtn("insertUnorderedList"), minimalShow: true },
    { icon: ListOrdered, title: "Numerisana lista", action: handleBtn("insertOrderedList"), minimalShow: true },
    { icon: Paintbrush, title: "Crvena boja", action: handleRed, hoverClass: "hover:text-destructive", minimalShow: false },
  ];

  const visibleButtons = minimal ? toolbarButtons.filter(b => b.minimalShow) : toolbarButtons;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-0.5 px-1 flex-wrap">
        {visibleButtons.map(({ icon: Icon, title, action, hoverClass }) => (
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
        {!minimal && (
          <span className="ml-auto text-[10px] text-muted-foreground/50 select-none">
            MD: **bold** *italic* __underline__ - lista 1. num # naslov
          </span>
        )}
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
          className={`${minimal ? "min-h-[60px]" : "min-h-[100px]"} resize-y overflow-auto rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4`}
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

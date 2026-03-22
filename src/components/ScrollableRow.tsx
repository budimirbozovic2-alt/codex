import { useRef, useState, useEffect, useCallback, ReactNode, forwardRef } from "react";
import { default as ChevronLeft } from "lucide-react/dist/esm/icons/chevron-left";
import { default as ChevronRight } from "lucide-react/dist/esm/icons/chevron-right";

interface Props {
  children: ReactNode;
  className?: string;
}

const ScrollableRow = forwardRef<HTMLDivElement, Props>(function ScrollableRow({ children, className = "" }, _ref) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", checkScroll); ro.disconnect(); };
  }, [checkScroll, children]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -160 : 160, behavior: "smooth" });
  };

  return (
    <div className="relative group">
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-7 w-7 flex items-center justify-center rounded-full bg-card border shadow-sm text-muted-foreground hover:text-foreground transition-opacity opacity-0 group-hover:opacity-100"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}
      <div
        ref={scrollRef}
        className={`flex gap-1.5 overflow-x-auto pb-1 -mb-1 ${className}`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        {children}
      </div>
      {canScrollRight && (
        <>
          <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-card to-transparent" />
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-7 w-7 flex items-center justify-center rounded-full bg-card border shadow-sm text-muted-foreground hover:text-foreground transition-opacity opacity-0 group-hover:opacity-100"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      {canScrollLeft && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-1 w-8 bg-gradient-to-r from-card to-transparent" />
      )}
    </div>
  );
}

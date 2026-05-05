import { ReactNode, useId } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DialogShellProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** id of element labelling the dialog (for aria-labelledby). If omitted, a hidden fallback label is rendered. */
  labelledBy?: string;
  describedBy?: string;
  /** Backdrop classes (background + alignment overrides). */
  backdropClassName?: string;
  /** Panel classes (card visuals). */
  panelClassName?: string;
  /** Vertical alignment of the panel inside the viewport. */
  align?: "center" | "top";
  /** Close when clicking the backdrop. Default true. */
  closeOnBackdrop?: boolean;
  /** z-index utility class. Defaults to z-modal-elevated. */
  zClassName?: string;
}

/**
 * Accessible dialog shell built on Radix `@radix-ui/react-dialog`.
 *
 * Replaces the previous custom Modal: Radix gives us focus-trap, ESC-to-close,
 * focus-restore, body inertness, and aria-modal for free. We layer framer-motion
 * on top for the same enter/exit animations as before, and keep the
 * `panelClassName` / `backdropClassName` / `zClassName` API so existing
 * consumers don't need styling changes.
 */
export default function DialogShell({
  open,
  onClose,
  children,
  labelledBy,
  describedBy,
  backdropClassName,
  panelClassName,
  align = "center",
  closeOnBackdrop = true,
  zClassName = "z-modal-elevated",
}: DialogShellProps) {
  const autoId = useId();
  const labelId = labelledBy ?? `dialog-title-${autoId}`;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
    >
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn(
                  "fixed inset-0 flex p-4",
                  align === "center" ? "items-center justify-center" : "items-start justify-center pt-[15vh]",
                  zClassName,
                  backdropClassName,
                )}
                onClick={closeOnBackdrop ? onClose : undefined}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content
              aria-labelledby={labelId}
              aria-describedby={describedBy}
              onPointerDownOutside={(e) => { if (!closeOnBackdrop) e.preventDefault(); }}
              onInteractOutside={(e) => { if (!closeOnBackdrop) e.preventDefault(); }}
              asChild
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: align === "top" ? -10 : 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: align === "top" ? -10 : 8 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "fixed outline-none",
                  zClassName,
                  align === "center"
                    ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    : "left-1/2 top-[15vh] -translate-x-1/2",
                  panelClassName,
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {!labelledBy && (
                  <DialogPrimitive.Title id={labelId} className="sr-only">Dijalog</DialogPrimitive.Title>
                )}
                {children}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

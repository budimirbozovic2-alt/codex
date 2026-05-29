import { ReactNode, useId } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { m, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface DialogShellProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  describedBy?: string;
  backdropClassName?: string;
  panelClassName?: string;
  align?: "center" | "top";
  closeOnBackdrop?: boolean;
  zClassName?: string;
}

/**
 * Accessible dialog shell built on Radix `@radix-ui/react-dialog`.
 *
 * Radix provides focus-trap, ESC-to-close, focus-restore, body inertness,
 * aria-modal — replacing the previous custom Modal implementation. We keep
 * the `panelClassName` / `backdropClassName` / `zClassName` API so existing
 * consumers don't need styling changes. Positioning is handled by absolutely-
 * positioning the Content full-screen and using flex centering inside it,
 * matching the old Modal layout exactly.
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

  const layoutClass = cn(
    "fixed inset-0 flex p-4",
    align === "center" ? "items-center justify-center" : "items-start justify-center pt-[15vh]",
    zClassName,
  );

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => { if (!o && closeOnBackdrop) onClose(); else if (!o) onClose(); }}
      modal
    >
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild>
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn(layoutClass, backdropClassName)}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content
              aria-labelledby={labelId}
              aria-describedby={describedBy}
              onPointerDownOutside={(e) => { if (!closeOnBackdrop) e.preventDefault(); }}
              onInteractOutside={(e) => { if (!closeOnBackdrop) e.preventDefault(); }}
              asChild
            >
              <m.div
                initial={{ opacity: 0, scale: 0.96, y: align === "top" ? -10 : 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: align === "top" ? -10 : 8 }}
                transition={{ duration: 0.18 }}
                className={cn(layoutClass, "pointer-events-none")}
              >
                <div className={cn("pointer-events-auto outline-none", panelClassName)}>
                  {!labelledBy && (
                    <DialogPrimitive.Title id={labelId} className="sr-only">Dijalog</DialogPrimitive.Title>
                  )}
                  {children}
                </div>
              </m.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

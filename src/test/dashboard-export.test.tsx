import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Download } from "lucide-react";
import { StatusIconsRow } from "@/components/dashboard/StatusIconsRow";

describe("StatusIconsRow export", () => {
  it("calls onExport from backup tooltip action", () => {
    const onExport = vi.fn();
    render(
      <StatusIconsRow
        onExport={onExport}
        icons={[
          {
            key: "backup",
            icon: <Download className="h-4 w-4" />,
            color: "text-warning",
            label: "Backup stariji od 7 dana",
            critical: true,
          },
        ]}
      />,
    );

    const trigger = screen.getByRole("status").firstElementChild as HTMLElement;
    fireEvent.pointerEnter(trigger);
    fireEvent.focus(trigger);

    const [backupAction] = screen.getAllByRole("button", { name: "Napravi backup" });
    fireEvent.click(backupAction!);
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});

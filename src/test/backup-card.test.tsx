import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BackupCard } from "@/components/dashboard/BackupCard";

vi.mock("@/hooks/card/useCardsQuery", () => ({
  useCardCountAll: () => 3,
}));

vi.mock("@/hooks/cards/useActions", () => ({
  useBackupActions: () => ({
    exportData: vi.fn(),
    exportTemplate: vi.fn(),
    importData: vi.fn(),
  }),
}));

vi.mock("@/lib/backup/backup-metadata", () => ({
  getLastBackupTime: vi.fn(async () => 0),
}));

vi.mock("@/components/ExportImportDialog", () => ({
  default: () => null,
}));

describe("BackupCard", () => {
  it("renders backup card shell", () => {
    render(<BackupCard />);
    expect(screen.getByText("Backup & vraćanje")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Brzi backup/i })).toBeInTheDocument();
  });
});

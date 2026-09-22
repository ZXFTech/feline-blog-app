import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ChecklistsPage from "@/app/checklists/page";

const mocks = vi.hoisted(() => ({
  getChecklists: vi.fn(),
}));

vi.mock("@/db/checklistAction", () => ({
  getChecklists: mocks.getChecklists,
}));

vi.mock("@/components/Content", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/Checklist/ChecklistListFilters", () => ({
  ChecklistListFilters: () => <div>清单筛选</div>,
}));

describe("ChecklistsPage empty states", () => {
  beforeEach(() => {
    mocks.getChecklists.mockResolvedValue({
      status: "success",
      data: {
        items: [],
        nextCursor: null,
        asOf: "2026-09-23T00:00:00.000Z",
        serverNow: "2026-09-23T00:00:00.000Z",
      },
    });
  });

  it("offers to reset an empty expired checklist view", async () => {
    render(
      await ChecklistsPage({
        searchParams: Promise.resolve({ expiry: "expired", confirmation: "confirmed" }),
      })
    );

    expect(screen.getByRole("heading", { name: "没有已过期的清单" })).toBeVisible();
    expect(screen.getByRole("link", { name: "重置筛选" })).toHaveAttribute("href", "/checklists");
    expect(screen.queryByRole("link", { name: "创建清单" })).not.toBeInTheDocument();
  });

  it("keeps the default empty checklist action", async () => {
    render(await ChecklistsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "这里还没有符合条件的清单" })).toBeVisible();
    expect(screen.getByRole("link", { name: "创建清单" })).toHaveAttribute(
      "href",
      "/checklists/new"
    );
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChecklistListFilters } from "@/components/Checklist/ChecklistListFilters";

const navigation = vi.hoisted(() => ({
  params: "q=%E6%97%A7%E7%AD%9B%E9%80%89&expiry=expired",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/checklists",
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.params),
}));

describe("ChecklistListFilters", () => {
  it("clears its local query when navigation resets the URL filters", async () => {
    const { rerender } = render(<ChecklistListFilters />);
    expect(screen.getByRole("textbox", { name: "搜索清单" })).toHaveValue("旧筛选");

    navigation.params = "";
    rerender(<ChecklistListFilters />);

    await waitFor(() => expect(screen.getByRole("textbox", { name: "搜索清单" })).toHaveValue(""));
  });
});

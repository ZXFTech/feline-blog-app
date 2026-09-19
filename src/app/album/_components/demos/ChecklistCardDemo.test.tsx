import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import ChecklistCardDemo from "@/app/album/_components/demos/ChecklistCardDemo";

describe("ChecklistCardDemo", () => {
  it("shows the documented sizes and checklist states", () => {
    render(<ChecklistCardDemo />);

    expect(screen.getByRole("heading", { name: "清单卡片 ChecklistCard" })).toBeVisible();
    for (const label of ["sm", "md", "lg", "未完成", "部分完成", "全部完成", "已过期"]) {
      expect(screen.getByText(label, { selector: "p" })).toBeVisible();
    }
    expect(screen.getAllByRole("img", { name: /未确认|部分确认|全部确认/ }).length).toBeGreaterThan(
      0
    );
  });

  it("keeps delete and restore inside the local sandbox", async () => {
    const user = userEvent.setup();
    render(<ChecklistCardDemo />);
    const sandboxHeading = screen.getByRole("heading", { name: "本地交互沙箱" });
    const sandbox = sandboxHeading.closest("section");
    expect(sandbox).not.toBeNull();
    const scoped = within(sandbox as HTMLElement);

    await user.click(scoped.getByRole("button", { name: "删除清单" }));
    expect(scoped.getByText("清单卡片已从本地沙箱移除")).toBeVisible();
    expect(scoped.getByText("已从本地沙箱删除：版本发布检查")).toBeVisible();

    await user.click(scoped.getByRole("button", { name: /恢复默认样例/ }));
    expect(scoped.getByRole("button", { name: "查看清单详情：版本发布检查" })).toBeVisible();
    expect(scoped.getByText("已恢复默认样例")).toBeVisible();
  });
});

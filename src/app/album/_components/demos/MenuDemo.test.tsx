import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import MenuDemo from "@/app/album/_components/demos/MenuDemo";

describe("MenuDemo", () => {
  it("keeps dropdown actions inside local showcase state", async () => {
    const user = userEvent.setup();
    render(<MenuDemo />);

    await user.click(screen.getByRole("button", { name: "打开操作菜单" }));
    await user.click(screen.getByRole("menuitem", { name: "编辑样例" }));

    expect(screen.getByText("已选择编辑样例")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("opens and closes the controlled popover", async () => {
    const user = userEvent.setup();
    render(<MenuDemo />);

    await user.click(screen.getByRole("button", { name: "start" }));
    await user.click(screen.getByRole("button", { name: "打开气泡说明" }));

    expect(screen.getByText("当前使用 start 对齐，不会读取或写入真实数据。")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByText("本地信息气泡")).not.toBeInTheDocument());
  });

  it("renders closed triggers for the four theme comparison", () => {
    render(<MenuDemo compact />);

    expect(screen.getByRole("button", { name: "菜单触发器" })).toBeVisible();
    expect(screen.getByRole("button", { name: "气泡触发器" })).toBeVisible();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

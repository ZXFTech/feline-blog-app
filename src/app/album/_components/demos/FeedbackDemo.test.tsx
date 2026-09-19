import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import FeedbackDemo from "@/app/album/_components/demos/FeedbackDemo";
import { ThemeProvider } from "@/components/theme-provider";

function renderDemo(compact = false) {
  return render(
    <ThemeProvider>
      <FeedbackDemo compact={compact} />
    </ThemeProvider>
  );
}

describe("FeedbackDemo", () => {
  it("covers: AC-6 and AC-9, keeps tag selection and removal in local state", async () => {
    const user = userEvent.setup();
    renderDemo();

    await user.click(screen.getByRole("button", { name: "可选择" }));
    expect(screen.getByRole("button", { name: "已选择" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "移除可关闭" }));
    expect(screen.queryByText("可关闭")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "恢复标签" }));
    expect(screen.getByText("可关闭")).toBeVisible();
  });

  it("covers: AC-8, renders a compact representative without a global theme control", () => {
    renderDemo(true);

    expect(screen.getByText("ready")).toBeVisible();
    expect(screen.getByText("主题样例")).toBeVisible();
    expect(screen.queryByRole("radiogroup", { name: "Theme" })).not.toBeInTheDocument();
  });
});

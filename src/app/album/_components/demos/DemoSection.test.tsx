import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ComponentDemoGroup, DemoSection } from "@/app/album/_components/demos/DemoSection";

describe("DemoSection", () => {
  it("covers: AC-2, preserves the documented heading hierarchy", () => {
    render(
      <ComponentDemoGroup title="组件家族" description="组件用途说明">
        <DemoSection nested title="展示场景">
          <button type="button">真实操作</button>
        </DemoSection>
      </ComponentDemoGroup>
    );

    expect(screen.getByRole("heading", { level: 3, name: "组件家族" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 4, name: "展示场景" })).toBeVisible();
    expect(screen.getByText("组件用途说明")).toBeVisible();
    expect(screen.getByRole("button", { name: "真实操作" })).toBeVisible();
  });
});

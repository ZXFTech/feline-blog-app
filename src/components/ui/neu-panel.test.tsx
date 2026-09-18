import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { NeuPanel } from "@/components/ui/neu-panel";

describe("NeuPanel", () => {
  it("uses the default content panel spacing and vertical layout", () => {
    render(<NeuPanel aria-label="内容面板">内容</NeuPanel>);

    expect(screen.getByLabelText("内容面板")).toHaveClass(
      "p-[var(--spacing-panel-inset-default)]",
      "gap-[var(--spacing-panel-gap-default)]",
      "flex",
      "flex-col"
    );
  });

  it("supports the compact row variant and forwards its ref", () => {
    const ref = createRef<HTMLDivElement>();

    render(
      <NeuPanel ref={ref} density="compact" layout="row">
        内容
      </NeuPanel>
    );

    expect(ref.current).toHaveClass(
      "p-[var(--spacing-panel-inset-compact)]",
      "gap-[var(--spacing-panel-gap-compact)]",
      "flex-row"
    );
  });

  it("supports comfortable grid panels", () => {
    render(
      <NeuPanel aria-label="网格面板" density="comfortable" layout="grid">
        内容
      </NeuPanel>
    );

    expect(screen.getByLabelText("网格面板")).toHaveClass(
      "p-[var(--spacing-panel-inset-comfortable)]",
      "gap-[var(--spacing-panel-gap-comfortable)]",
      "grid"
    );
  });

  it("lets an intentional class override the standard spacing", () => {
    render(
      <NeuPanel aria-label="自定义面板" className="p-0 gap-0">
        内容
      </NeuPanel>
    );

    expect(screen.getByLabelText("自定义面板")).toHaveClass("p-0", "gap-0");
    expect(screen.getByLabelText("自定义面板")).not.toHaveClass(
      "p-[var(--spacing-panel-inset-default)]",
      "gap-[var(--spacing-panel-gap-default)]"
    );
  });
});

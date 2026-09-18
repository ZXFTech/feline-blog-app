import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { NeuSurface } from "@/components/ui/neu-surface";

describe("NeuSurface", () => {
  it("renders a non-interactive div and forwards its ref", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <NeuSurface ref={ref} elevation="inset" aria-label="摘要">
        内容
      </NeuSurface>
    );
    expect(screen.getByText("内容")).toBe(ref.current);
    expect(ref.current?.tagName).toBe("DIV");
    expect(ref.current).toHaveClass("shadow-neu-inset");
  });
});

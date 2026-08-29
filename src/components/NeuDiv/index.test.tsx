import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import NeuDiv, { neuSurfaceClassNames } from ".";

describe("NeuDiv", () => {
  it("renders its children with native div attributes", () => {
    render(
      <NeuDiv role="region" aria-label="专注摘要">
        今日完成两次专注
      </NeuDiv>,
    );

    expect(screen.getByRole("region", { name: "专注摘要" })).toHaveTextContent(
      "今日完成两次专注",
    );
  });

  it("forwards its ref to the rendered div", () => {
    const ref = createRef<HTMLDivElement>();

    render(<NeuDiv ref={ref}>内容</NeuDiv>);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toHaveTextContent("内容");
  });

  it("passes non-interactive native attributes to the rendered div", () => {
    render(
      <NeuDiv data-state="ready" title="摘要">
        内容
      </NeuDiv>,
    );

    expect(screen.getByTitle("摘要")).toHaveAttribute("data-state", "ready");
  });

  it("applies every supported surface and intensity", () => {
    const cases = [
      ["embossed", "sm", "neu-embossed-sm"],
      ["embossed", "normal", "neu-embossed-normal"],
      ["debossed", "sm", "neu-debossed-sm"],
      ["debossed", "normal", "neu-debossed-normal"],
    ] as const;

    for (const [surface, intensity, expectedClass] of cases) {
      const { unmount } = render(
        <NeuDiv surface={surface} intensity={intensity} />,
      );
      expect(document.querySelector(".neu-div")).toHaveClass(expectedClass);
      unmount();
    }

    const { rerender } = render(<NeuDiv surface="flat" intensity="sm" />);
    expect(document.querySelector(".neu-div")?.className).not.toMatch(
      /neu-flat|neu-embossed|neu-debossed/,
    );

    rerender(<NeuDiv surface="flat" intensity="normal" />);
    expect(document.querySelector(".neu-div")?.className).not.toMatch(
      /neu-flat|neu-embossed|neu-debossed/,
    );
  });

  it("keeps caller classes last and separates the raise interaction", () => {
    expect(
      neuSurfaceClassNames({
        surface: "flat",
        interactionEffect: "raise",
        className: "p-6",
      }),
    ).toContain("neu-interaction-raise-normal");

    expect(neuSurfaceClassNames({ surface: "flat", className: "p-6" })).toMatch(
      /p-6$/,
    );

    expect(
      neuSurfaceClassNames({
        surface: "flat",
        intensity: "sm",
        interactionEffect: "raise",
      }),
    ).toContain("neu-interaction-raise-sm");
  });

  it("uses the embossed normal surface by default", () => {
    render(<NeuDiv>默认表面</NeuDiv>);

    expect(screen.getByText("默认表面")).toHaveClass(
      "neu-embossed-normal",
      "p-1",
    );
  });
});

if (false) {
  // @ts-expect-error AC-1 raise is only valid on a flat surface.
  neuSurfaceClassNames({ surface: "embossed", interactionEffect: "raise" });
  // @ts-expect-error AC-6 legacy surface values are not public Neu surfaces.
  neuSurfaceClassNames({ surface: "raised" });
  // @ts-expect-error AC-6 unsupported intensities are rejected.
  neuSurfaceClassNames({ surface: "flat", intensity: "lg" });
}

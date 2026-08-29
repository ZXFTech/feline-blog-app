import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import NeuDiv from ".";

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

  it("passes native event handlers to the rendered div", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <NeuDiv role="button" tabIndex={0} onClick={handleClick}>
        打开详情
      </NeuDiv>,
    );

    await user.click(screen.getByRole("button", { name: "打开详情" }));

    expect(handleClick).toHaveBeenCalledOnce();
  });
});

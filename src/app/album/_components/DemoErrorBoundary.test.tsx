import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DemoErrorBoundary } from "@/app/album/_components/DemoErrorBoundary";

function BrokenDemo({ recovered }: { recovered: boolean }) {
  if (!recovered) throw new Error("demo chunk failed");
  return <p>演示已恢复</p>;
}

function Harness() {
  const [attempt, setAttempt] = useState(0);
  return (
    <DemoErrorBoundary
      componentName="测试组件"
      componentSlug="test-component"
      resetKey={String(attempt)}
      onRetry={() => setAttempt((value) => value + 1)}
    >
      <BrokenDemo recovered={attempt > 0} />
    </DemoErrorBoundary>
  );
}

describe("DemoErrorBoundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("isolates a failed demo and starts a fresh render attempt", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<Harness />);

    expect(screen.getByRole("alert")).toHaveTextContent("演示加载失败");
    expect(screen.getByRole("alert")).toHaveTextContent("测试组件");
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(screen.getByText("演示已恢复")).toBeInTheDocument();
    expect(console.error).toHaveBeenCalledWith("Album demo failed to render", {
      componentSlug: "test-component",
      errorName: "Error",
      hasComponentStack: true,
    });
  });
});

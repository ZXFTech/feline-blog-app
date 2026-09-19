import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import FoundationDemo from "@/app/album/_components/demos/FoundationDemo";

describe("FoundationDemo", () => {
  it("covers: AC-6, presents every supported surface elevation and panel density", () => {
    render(<FoundationDemo />);

    for (const label of [
      "raised",
      "raised-sm",
      "inset",
      "inset-sm",
      "flat",
      "compact",
      "default",
      "comfortable",
    ]) {
      expect(screen.getByText(label)).toBeVisible();
    }
  });

  it("covers: AC-8, limits the compact representative to the chosen elevations", () => {
    render(<FoundationDemo compact />);

    expect(screen.getByText("raised")).toBeVisible();
    expect(screen.getByText("inset")).toBeVisible();
    expect(screen.queryByText("comfortable")).not.toBeInTheDocument();
  });
});

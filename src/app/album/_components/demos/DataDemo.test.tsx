import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DataDemo from "@/app/album/_components/demos/DataDemo";

describe("DataDemo", () => {
  it("covers: AC-6, presents card structure and every documented icon size", () => {
    render(<DataDemo />);

    expect(screen.getAllByText("Album 条目")).toHaveLength(2);
    expect(screen.getAllByText("固定本地数据，不触发业务请求。")).toHaveLength(2);
    for (const size of ["xs", "sm", "md", "lg", "xl", "2xl", "3xl"]) {
      expect(screen.getByText(size)).toBeVisible();
    }
  });

  it("covers: AC-8 and AC-9, keeps the compact representative free of optional footer data", () => {
    render(<DataDemo compact />);

    expect(screen.getByText("Album 条目")).toBeVisible();
    expect(screen.getByText("ready")).toBeVisible();
    expect(screen.queryByText("已纳入目录")).not.toBeInTheDocument();
  });
});

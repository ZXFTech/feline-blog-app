import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { StyledLink } from "@/components/ui/styled-link";

describe("StyledLink", () => {
  it("covers: AC-6 preserves anchor semantics, href, ref, and activation", async () => {
    const ref = createRef<HTMLAnchorElement>();
    const onClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => event.preventDefault());
    render(
      <StyledLink ref={ref} href="/blog" onClick={onClick}>
        查看文章
      </StyledLink>
    );

    const link = screen.getByRole("link", { name: "查看文章" });
    expect(link).toHaveAttribute("href", "/blog");
    expect(ref.current).toBe(link);
    link.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });
});

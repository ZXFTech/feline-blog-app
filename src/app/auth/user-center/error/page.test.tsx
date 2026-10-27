import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
vi.mock("../_components/auth-frame", () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/lib/auth/center/http", () => ({ authMessages: { FLOW_EXPIRED: "本次操作已过期" } }));
import Page from "./page";
describe("0003 safe auth failure page", () => {
  it.each(["constructor", "__proto__", "unknown", ["FLOW_EXPIRED", "other"]])("AC-19 AC-20 shows a fixed fallback for untrusted error input %s", async code => {
    render(await Page({ searchParams: Promise.resolve({ code, requestId: "<unsafe>" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("登录或授权未完成，请从应用重新开始");
    expect(screen.queryByText(/请求编号/)).not.toBeInTheDocument();
  });
  it("AC-P7 uses the same fixed copy for known errors without a state carrier", async () => {
    render(await Page({ searchParams: Promise.resolve({ code: "FLOW_EXPIRED", requestId: "91fabba8-712e-49b8-b9fa-5ea3a76bd269" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("登录或授权未完成，请从应用重新开始"); expect(screen.queryByText(/请求编号/)).not.toBeInTheDocument();
  });
});

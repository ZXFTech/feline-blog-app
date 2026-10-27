import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActionForm from "./action-form";
afterEach(() => vi.unstubAllGlobals());
describe("0003 Chinese authentication controls", () => {
  it("AC-20 labels password fields and preserves a specific retryable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ data: { csrfToken: "csrf" } }) }).mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ message: "认证服务暂时不可用，请稍后重试。" }) }));
    const user = userEvent.setup();
    render(<ActionForm endpoint="/api/auth/user-center/bind/start" label="验证原密码" fields={[{ name: "password", label: "原博客密码", type: "password" }]} />);
    await user.type(screen.getByLabelText("原博客密码"), "test-password");
    await user.click(screen.getByRole("button", { name: "验证原密码" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("认证服务暂时不可用，请稍后重试。");
    expect(screen.getByRole("button", { name: "验证原密码" })).toBeEnabled();
  });
  it("AC-20 disables duplicate submissions while the request is outstanding", async () => {
    let finish!: (response: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const user = userEvent.setup();
    render(<ActionForm endpoint="/api/auth/user-center/start" label="使用用户中心登录" />);
    await user.click(screen.getByRole("button", { name: "使用用户中心登录" }));
    expect(screen.getByRole("button", { name: "正在处理…" })).toBeDisabled();
    finish({ ok: false, json: async () => ({ message: "页面已更新，请重试" }) });
    expect(await screen.findByRole("alert")).toHaveTextContent("页面已更新，请重试");
  });
});

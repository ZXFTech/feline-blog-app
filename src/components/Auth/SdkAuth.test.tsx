import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AuthActionButton } from "@/components/Auth/SdkAuth";
import { ProfileSetupForm } from "@/components/Auth/ProfileSetupForm";
it("shows an unconfirmed logout without automatically retrying", async () => {
  const action = vi.fn().mockRejectedValue(Error("SIGN_OUT_UNCONFIRMED"));
  render(<AuthActionButton label="退出当前平台" onAction={action} />);
  await userEvent.click(screen.getByRole("button", { name: "退出当前平台" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("退出尚未确认");
  expect(action).toHaveBeenCalledTimes(1);
});
it("requires explicit email confirmation and submits no role or browser identity", async () => {
  const submit = vi.fn().mockResolvedValue({ returnTo: "/profile" });
  render(
    <ProfileSetupForm email="reader@example.test" emailDigest={"a".repeat(64)} submit={submit} />
  );
  const button = screen.getByRole("button", { name: "完成博客资料" });
  expect(button).toBeDisabled();
  await userEvent.type(screen.getByLabelText(/博客昵称/), "Reader");
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(button);
  expect(submit).toHaveBeenCalledWith({
    action: "complete-profile",
    username: "Reader",
    emailConfirmed: true,
    emailSnapshotDigest: "a".repeat(64),
  });
  expect(await screen.findByRole("status")).toHaveTextContent("本地演示");
});

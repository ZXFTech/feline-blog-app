import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { Input } from "./input";

describe("controls wait for browser readiness", () => {
  it("does not accept server-rendered edits or clicks before handlers attach", () => {
    const html = renderToStaticMarkup(<><Button>保存</Button><Input aria-label="标题" /></>);
    const root = document.createElement("div"); root.innerHTML = html;
    expect(root.querySelector("button")).toBeDisabled(); expect(root.querySelector("input")).toBeDisabled();
  });
  it("accepts user input and keyboard activation once ready", async () => {
    const action = vi.fn(); const change = vi.fn();
    render(<><Input aria-label="标题" onChange={change} /><Button onClick={action}>保存</Button></>);
    await userEvent.type(screen.getByRole("textbox", { name: "标题" }), "猫");
    const button = screen.getByRole("button", { name: "保存" }); button.focus();
    await userEvent.keyboard("{Enter}");
    expect(change).toHaveBeenCalled(); expect(action).toHaveBeenCalledOnce();
  });
});

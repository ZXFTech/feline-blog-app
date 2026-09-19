import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AlbumShowcase } from "@/app/album/_components/AlbumShowcase";
import { getCatalogEntry, type ReadyCatalogEntry } from "@/app/album/_components/catalog";

const navigation = vi.hoisted(() => ({
  pathname: "/album",
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => navigation.searchParams,
}));

function LocalDemo() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((value) => value + 1)}>本地状态 {count}</button>;
}

function BrokenDemo(): never {
  throw new Error("fixture content must not reach logs");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function readyEntry(loadDemo: ReadyCatalogEntry["loadDemo"]): ReadyCatalogEntry {
  const button = getCatalogEntry("button");
  if (!button || button.status !== "ready") throw new Error("Button fixture is unavailable");
  return {
    ...button,
    loadDemo,
    capabilities: { ...button.capabilities, themeComparison: [] },
    scenarios: button.scenarios.filter((scenario) => scenario.dimension === "default"),
  };
}

describe("AlbumShowcase", () => {
  beforeEach(() => {
    navigation.pathname = "/album";
    navigation.searchParams = new URLSearchParams();
    navigation.push.mockReset();
    vi.restoreAllMocks();
  });

  it("preserves unrelated query parameters when selecting a component", async () => {
    navigation.searchParams = new URLSearchParams("component=button&source=verify");
    render(<AlbumShowcase />);

    fireEvent.click(screen.getAllByRole("button", { name: /输入、复选框与字段/ })[0]);

    expect(navigation.push).toHaveBeenCalledWith("/album?component=input-field&source=verify", {
      scroll: false,
    });
  });

  it("shows the default component for unknown slugs and preserves pending selection", () => {
    navigation.searchParams = new URLSearchParams("component=not-real");
    const { unmount } = render(<AlbumShowcase />);

    expect(screen.getByRole("status")).toHaveTextContent("未找到 “not-real”");
    expect(screen.getByRole("heading", { name: "按钮与链接操作" })).toBeInTheDocument();

    unmount();
    navigation.searchParams = new URLSearchParams("component=blog");
    render(<AlbumShowcase />);

    expect(screen.getByRole("heading", { name: "博客组件" })).toBeInTheDocument();
    expect(screen.getByText("为什么暂不可演示")).toBeInTheDocument();
    expect(screen.getByText("接入条件")).toBeInTheDocument();
  });

  it("starts a new dynamic load after failure and resets only the current sandbox", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const loadDemo = vi
      .fn<ReadyCatalogEntry["loadDemo"]>()
      .mockRejectedValueOnce(new TypeError("chunk unavailable"))
      .mockResolvedValue({ default: LocalDemo });
    render(<AlbumShowcase entries={[readyEntry(loadDemo)]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("演示加载失败");
    expect(screen.getAllByRole("button", { name: /按钮与链接操作/ }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByRole("button", { name: "本地状态 0" })).toBeInTheDocument();
    expect(loadDemo).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "本地状态 0" }));
    expect(screen.getByRole("button", { name: "本地状态 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /重置样例/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "本地状态 0" })).toBeInTheDocument()
    );
    expect(loadDemo).toHaveBeenCalledTimes(2);
  });

  it("isolates a render failure and reloads the selected module before retrying", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const loadDemo = vi
      .fn<ReadyCatalogEntry["loadDemo"]>()
      .mockResolvedValueOnce({ default: BrokenDemo })
      .mockResolvedValueOnce({ default: LocalDemo });
    render(<AlbumShowcase entries={[readyEntry(loadDemo)]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("按钮与链接操作");
    expect(console.error).toHaveBeenCalledWith("Album demo failed to render", {
      componentSlug: "button",
      errorName: "Error",
      hasComponentStack: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByRole("button", { name: "本地状态 0" })).toBeInTheDocument();
    expect(loadDemo).toHaveBeenCalledTimes(2);
  });

  it("covers: AC-11, ignores a stale demo result after the selected component changes", async () => {
    const firstLoad = deferred<{ default: () => React.JSX.Element }>();
    const secondLoad = deferred<{ default: () => React.JSX.Element }>();
    const firstEntry = readyEntry(() => firstLoad.promise);
    const secondEntry: ReadyCatalogEntry = {
      ...readyEntry(() => secondLoad.promise),
      slug: "second-demo",
      nameZh: "第二个演示",
      codeName: "SecondDemo",
    };
    const entries = [firstEntry, secondEntry];
    const { rerender } = render(<AlbumShowcase entries={entries} />);

    navigation.searchParams = new URLSearchParams("component=second-demo");
    rerender(<AlbumShowcase entries={entries} />);
    await act(async () => {
      secondLoad.resolve({ default: () => <p>新的演示内容</p> });
    });
    expect(await screen.findByText("新的演示内容")).toBeVisible();

    await act(async () => {
      firstLoad.resolve({ default: () => <p>迟到的旧演示</p> });
    });
    expect(screen.queryByText("迟到的旧演示")).not.toBeInTheDocument();
    expect(screen.getByText("新的演示内容")).toBeVisible();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditPage from "@/app/blog/edit/[id]/page";
import NewPage from "@/app/blog/new/page";
import { getBlogDraft, getBlogEditorData } from "@/db/blogDraftAction";
import { hasBlogRoles } from "@/lib/auth/userAuth";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
  useRouter: () => ({ refresh }),
}));
vi.mock("@/lib/auth/userAuth", () => ({ hasBlogRoles: vi.fn() }));
vi.mock("@/db/blogDraftAction", () => ({
  getBlogDraft: vi.fn(),
  getBlogEditorData: vi.fn(),
}));
vi.mock("@/db/tagAction", () => ({ getAllTags: vi.fn() }));
vi.mock("@/components/BlogList/BlogEditor", () => ({ default: () => <p>编辑器</p> }));

describe("private blog editor pages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects an anonymous visitor to sign in without reading the requested draft", async () => {
    vi.mocked(hasBlogRoles).mockResolvedValueOnce({
      status: "unauthenticated",
      message: "请登录",
    });

    await expect(NewPage({ searchParams: Promise.resolve({ draft: "draft-id" }) })).rejects.toThrow(
      "NEXT_REDIRECT:/login"
    );
    expect(getBlogDraft).not.toHaveBeenCalled();
  });

  it("leaves an SDK verification failure on a recoverable page", async () => {
    vi.mocked(hasBlogRoles).mockResolvedValueOnce({
      status: "temporary_failure",
      message: "暂时无法验证登录状态",
    });

    render(await NewPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("alert")).toHaveTextContent("读取失败");
    expect(screen.queryByText("编辑器")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("leaves an edit read failure recoverable and keeps the internal message private", async () => {
    vi.mocked(getBlogEditorData).mockResolvedValueOnce({
      status: "temporary_failure",
      message: "private expected read failure",
    });

    render(await EditPage({ params: Promise.resolve({ id: "1" }) }));

    expect(screen.getByRole("heading", { name: "暂时无法打开草稿" })).toBeVisible();
    expect(screen.queryByText("private expected read failure")).not.toBeInTheDocument();
  });
});

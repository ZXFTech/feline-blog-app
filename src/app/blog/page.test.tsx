import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Blog from "@/app/blog/page";
import Detail from "@/app/blog/[id]/page";
import New from "@/app/blog/new/page";
import Edit from "@/app/blog/edit/[id]/page";
import { getBlogById, getBlogList } from "@/db/blogAction";
import { getCurrentUser } from "@/lib/auth/userAuth";
import type { ReactNode } from "react";

vi.mock("@/db/blogAction", () => ({ getBlogById: vi.fn(), getBlogList: vi.fn() }));
vi.mock("@/lib/auth/userAuth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/BlogList/BlogEditor", () => ({ default: () => null }));
vi.mock("@/components/BlogList/BlogListOperationBar", () => ({ BlogListOperationBar: () => null }));
vi.mock("@/components/Blog/BlogOperationBar", () => ({ default: () => <div>文章互动</div> }));
vi.mock("@/components/Blog/AdjacentBlogs", () => ({ default: () => <div>相邻导航</div> }));
vi.mock("@/components/Auth/PermissionAccess", () => ({ PermissionAccess: () => null }));
vi.mock("@/components/Blog/BlogReading", () => ({
  BlogReading: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/Blog/TOC", () => ({ default: () => null }));

beforeEach(() => vi.clearAllMocks());

describe("Blog server state mapping", () => {
  it.each(["", "  \n\t"])(
    "retains a normal article and its raw body for empty content %j",
    async (content) => {
      vi.mocked(getBlogById).mockResolvedValue({
        status: "success",
        data: {
          blog: {
            id: 1,
            title: "空文章标题",
            content,
            authorId: "author",
            author: { id: "author", avatar: null, username: "本地作者" },
            tags: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            delete: false,
            likeCount: 0,
            favoriteCount: 0,
          },
          isLiked: false,
          isFavorite: false,
        },
      });
      const { container } = render(await Detail({ params: Promise.resolve({ id: "1" }) }));
      expect(screen.getByRole("heading", { name: "空文章标题" })).toBeVisible();
      expect(screen.getByText("本地作者")).toBeVisible();
      expect(screen.getByText("这是一篇空文章")).toBeVisible();
      expect(screen.getByText("文章互动")).toBeVisible();
      expect(screen.getByText("相邻导航")).toBeVisible();
      expect(container.querySelector("#blog-content")).not.toHaveTextContent("这是一篇空文章");
    }
  );
  it("keeps a failed list actionable without inventing a result count", async () => {
    vi.mocked(getBlogList).mockResolvedValue({
      status: "temporary_failure",
      message: "private database detail",
    });
    render(await Blog({ searchParams: Promise.resolve({ content: " term ", orderBy: "asc" }) }));
    expect(screen.getByRole("heading", { name: "文章", level: 1 })).toBeVisible();
    expect(screen.getByText("结果暂不可用")).toBeVisible();
    expect(screen.getByRole("button", { name: "重试" })).toBeVisible();
    expect(screen.getByRole("link", { name: "返回文章列表" })).toHaveAttribute("href", "/blog");
    expect(screen.queryByText(/private database/)).not.toBeInTheDocument();
  });

  it("normalizes URL values for both the query and visible result context", async () => {
    vi.mocked(getBlogList).mockResolvedValue({
      status: "success",
      data: { blogs: [], total: 24, pageBean: { pageNum: 1, pageSize: 20 } },
    });
    render(
      await Blog({
        searchParams: Promise.resolve({ content: [" term ", "ignored"], orderBy: "invalid" }),
      })
    );
    expect(getBlogList).toHaveBeenCalledWith(1, 20, { content: "term", orderBy: "desc" });
    expect(screen.getByText(/正文包含“term”/)).toBeVisible();
    expect(screen.getByText(/只显示前 20 篇/)).toBeVisible();
  });

  it.each(["invalid_input", "not_found"] as const)(
    "routes %s to framework notFound",
    async (status) => {
      vi.mocked(getBlogById).mockResolvedValue({ status, message: "missing" });
      await expect(Detail({ params: Promise.resolve({ id: "bad" }) })).rejects.toThrow(
        "NEXT_NOT_FOUND"
      );
    }
  );

  it("routes a successful missing article to notFound", async () => {
    vi.mocked(getBlogById).mockResolvedValue({
      status: "success",
      data: { blog: null, isLiked: false, isFavorite: false },
    });
    await expect(Detail({ params: Promise.resolve({ id: "123" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });

  it("keeps temporary detail failure distinct from a missing article", async () => {
    vi.mocked(getBlogById).mockResolvedValue({
      status: "temporary_failure",
      message: "private database detail",
    });
    render(await Detail({ params: Promise.resolve({ id: "123" }) }));
    expect(screen.getByRole("button", { name: "重试" })).toBeVisible();
    expect(screen.queryByText("404")).not.toBeInTheDocument();
    expect(screen.queryByText(/private database/)).not.toBeInTheDocument();
  });

  it.each(["list", "detail", "new", "edit"] as const)(
    "AC-8: lets an unexpected %s page dependency exception reach the route boundary",
    async (surface) => {
      const failure = new Error("private unexpected page dependency failure");
      if (surface === "list") vi.mocked(getBlogList).mockRejectedValueOnce(failure);
      else if (surface === "new") vi.mocked(getCurrentUser).mockRejectedValueOnce(failure);
      else vi.mocked(getBlogById).mockRejectedValueOnce(failure);

      const request =
        surface === "list"
          ? Blog({ searchParams: Promise.resolve({}) })
          : surface === "detail"
            ? Detail({ params: Promise.resolve({ id: "1" }) })
            : surface === "new"
              ? New()
              : Edit({ params: Promise.resolve({ id: 1 }) });

      await expect(request).rejects.toBe(failure);
    }
  );

  it("AC-8, AC-11: preserves the existing edit redirect for an expected read failure", async () => {
    vi.mocked(getBlogById).mockResolvedValueOnce({
      status: "temporary_failure",
      message: "private expected read failure",
    });

    await expect(Edit({ params: Promise.resolve({ id: 1 }) })).rejects.toThrow(
      "NEXT_REDIRECT:/blog"
    );
  });

  it("AC-8, AC-11: keeps anonymous authors on the existing login redirect", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);

    await expect(New()).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});

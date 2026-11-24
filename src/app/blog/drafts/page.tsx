import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Content from "@/components/Content";
import { BlogDrafts } from "@/components/BlogList/BlogDrafts";
import { BlogEditorRecovery } from "@/components/BlogList/BlogEditorRecovery";
import { getMyBlogDrafts } from "@/db/blogDraftAction";

export const metadata: Metadata = { title: "我的草稿", robots: { index: false, follow: false } };
export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const params = await searchParams;
  const result = await getMyBlogDrafts(params.page ?? 1);
  if (result.status === "unauthenticated") redirect("/login");
  if (result.status === "forbidden")
    return (
      <Content>
        <BlogEditorRecovery status={result.status} />
      </Content>
    );
  return (
    <Content>
      <BlogDrafts initial={result} />
    </Content>
  );
}

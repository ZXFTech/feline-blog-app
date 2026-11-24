import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { hasBlogRoles } from "@/lib/auth/userAuth";
import BlogEditor from "@/components/BlogList/BlogEditor";
import Content from "@/components/Content";
import { getBlogDraft } from "@/db/blogDraftAction";
import { getAllTags } from "@/db/tagAction";
import { BlogEditorRecovery } from "@/components/BlogList/BlogEditorRecovery";
import type { BlogEditorSeed } from "@/types/blog-draft";

export const metadata: Metadata = { title: "新建文章", robots: { index: false, follow: false } };
const emptySeed: BlogEditorSeed = {
  draftId: null,
  blogId: null,
  title: "",
  content: "",
  tags: [],
  revision: 0,
  publishedRevision: 0,
  savedAt: null,
};
const New = async ({ searchParams }: { searchParams: Promise<{ draft?: string | string[] }> }) => {
  const auth = await hasBlogRoles();
  if (auth.status === "unauthenticated") redirect("/login");
  if (auth.status !== "success")
    return (
      <Content>
        <BlogEditorRecovery status={auth.status} />
      </Content>
    );
  const { draft } = await searchParams;
  const result =
    draft === undefined
      ? { status: "success" as const, data: emptySeed }
      : await getBlogDraft(draft);
  if (result.status !== "success")
    return (
      <Content>
        <BlogEditorRecovery status={result.status} />
      </Content>
    );
  const options = await getAllTags();

  return (
    <Content>
      <BlogEditor
        seed={result.data}
        optionTags={options.status === "success" ? options.data : []}
      />
    </Content>
  );
};

export default New;

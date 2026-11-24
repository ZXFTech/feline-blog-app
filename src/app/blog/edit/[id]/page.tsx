import BlogEditor from "@/components/BlogList/BlogEditor";
import { getBlogEditorData } from "@/db/blogDraftAction";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Content from "@/components/Content";
import { getAllTags } from "@/db/tagAction";
import { BlogEditorRecovery } from "@/components/BlogList/BlogEditorRecovery";

interface Props {
  params: Promise<{ id: string }>;
}
export const metadata: Metadata = { title: "编辑文章", robots: { index: false, follow: false } };
const Edit = async ({ params }: Props) => {
  const { id } = await params;
  const result = await getBlogEditorData(id);
  if (result.status === "unauthenticated") redirect("/login");
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

export default Edit;

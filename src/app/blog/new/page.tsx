import Content from "@/components/Content/content";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/userAuth";
import BlogEditor from "@/components/BlogList/BlogEditor";

const New = async () => {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <Content>
      <BlogEditor />
    </Content>
  );
};

export default New;

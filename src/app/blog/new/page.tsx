import Content from "@/components/Content/content";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import BlogEditor from "./BlogEditor";

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

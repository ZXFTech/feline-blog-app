import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/userAuth";
import BlogEditor from "@/components/BlogList/BlogEditor";
import Content from "@/components/Content";

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

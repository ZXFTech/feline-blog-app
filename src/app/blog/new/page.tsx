import { redirect } from "next/navigation";
import { resolveCurrentUser } from "@/lib/auth/userAuth";
import BlogEditor from "@/components/BlogList/BlogEditor";
import Content from "@/components/Content";
import Link from "next/link";

const New = async () => {
  const auth = await resolveCurrentUser();
  if (auth.status === "temporary_failure") return <Content><p role="alert">{auth.message}</p><Link href="/blog/new" prefetch={false}>重试</Link></Content>;
  if (auth.status !== "success") {
    redirect("/login");
  }

  return (
    <Content>
      <BlogEditor />
    </Content>
  );
};

export default New;

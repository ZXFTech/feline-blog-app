"use server";

import db from "./client";
export async function createBlog({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  try {
    const res = await db.blog.create({
      data: {
        title,
        content: content,
        authorId: "test-user",
      },
    });
    return { data: { blogId: res.id }, error: false };
  } catch (err) {
    console.log("Create blog failed!", err);
    return { error: true, message: "Create blog failed!" + err };
  }
}

export async function getBlogById(blogId: number) {
  try {
    const res = await db.blog.findFirst({
      where: {
        id: Number(blogId),
      },
      include: {
        TagsOnBlog: true,
        author: true,
      },
    });
    return { data: res, error: false };
  } catch (err) {
    console.log("Find blog failed!", err);
    return { error: true, message: "Find blog failed!" + err };
  }
}

export async function updateBlogById(
  blogId: number,
  { title, content }: { title: string; content: string }
) {
  try {
    const res = await db.blog.update({
      where: {
        id: Number(blogId),
      },
      data: {
        title,
        content: content,
      },
    });
    return { data: { blogId: res.id }, error: false };
  } catch (err) {
    console.log("Update blog failed!", err);
    return { error: true, message: "Update blog failed!" + err };
  }
}

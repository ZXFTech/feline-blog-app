// import React from "react";
// import BlogList from "@/components/BlogList/blogList";
// import { GetStaticProps, InferGetStaticPropsType, Metadata } from "next";
// import { queryDatabase } from "@/api/notion/database-api";
// import { NotionBlogProperties } from "@/api/notion/types";

// const databaseId = process.env.DATABASE_ID;

// export const getStaticProps = (async () => {
//   if (!databaseId) {
//     return { notFound: true };
//   }
//   try {
//     const res = await queryDatabase(databaseId);
//     const results = res.results as unknown as NotionBlogProperties[];

//     // const pageResult = await queryBlog(results[0].id);
//     // return pageResult;
//     results.forEach((item) => {
//       item.id = `notion-${item.id}`;
//     });
//     return { props: { blogList: results }, revalidate: 60 };
//   } catch (error) {
//     console.error("query notion database error:" + error);
//     return {
//       notFound: true,
//       revalidate: 60,
//     };
//   }
// }) satisfies GetStaticProps<{
//   blogList: NotionBlogProperties[];
// }>;

// export function Blog({
//   blogList,
// }: InferGetStaticPropsType<typeof getStaticProps>) {
//   return (
//     <BlogList
//       dataSource={blogList}
//       pageBean={{ pageNum: 0, pageSize: 20, total: 5 }}
//     />
//   );
// }
// export const metadata: Metadata = {
//   title: "博客列表",
// };

// export default Blog;
const BlogList = () => {
  return <div>BlogList</div>;
};

export default BlogList;

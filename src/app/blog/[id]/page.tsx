// import Head from "next/head";
// import { format } from "date-fns";
// import {
//   queryBlog,
//   queryBlogContent,
//   queryDatabase,
// } from "@/api/notion/database-api";
// import { GetStaticPaths, GetStaticProps } from "next";
// import { NotionPage } from "@/api/notion/types";
// import NeuDiv from "@/components/NeuDiv/NeuDiv";
// import Tag from "@/components/Tag/tag";
// import { BlogOrigin } from "@/types";
// import NotionBlock from "@/components/NotionBlock/notionBlock";

// import {
//   BlockObjectResponse,
//   ListBlockChildrenResponse,
// } from "@notionhq/client/build/src/api-endpoints";
// import Image from "next/image";

// export const getStaticProps: GetStaticProps<{
//   blogRes?: NotionPage;
//   contentRes?: ListBlockChildrenResponse;
//   origin?: BlogOrigin;
// }> = async ({ params }) => {
//   try {
//     const id = params!.id as string;
//     const [origin, ...rest] = id.split("-");
//     const blogId = rest.join("-");
//     if (origin === BlogOrigin.NOTION) {
//       const [blogRes, contentRes] = await Promise.all([
//         queryBlog(blogId),
//         queryBlogContent(blogId),
//       ]);
//       return {
//         props: { blogRes, contentRes, origin: BlogOrigin.NOTION } as {
//           blogRes: NotionPage;
//           contentRes: ListBlockChildrenResponse;
//           origin: BlogOrigin;
//         },
//         revalidate: 60,
//       };
//     }
//     return {
//       notFound: true,
//     };
//   } catch (error) {
//     console.error("query notion list error", error);
//     return {
//       notFound: true,
//     };
//   }
// };
// export const getStaticPaths = (async () => {
//   try {
//     const { results } = await queryDatabase(process.env.DATABASE_ID!);
//     const paths = results.map((result) => ({
//       params: { id: `notion-${result.id}` },
//     }));
//     return {
//       paths,
//       fallback: "blocking",
//     };
//   } catch (error) {
//     console.error("query notion blog list error:" + error);
//     return {
//       paths: [],
//       fallback: "blocking",
//     };
//   }
// }) satisfies GetStaticPaths;

// const PostLayout = ({
//   blogRes,
//   contentRes,
//   origin,
// }: {
//   blogRes: NotionPage;
//   contentRes: ListBlockChildrenResponse;
//   origin: BlogOrigin;
// }) => {
//   if (!blogRes && !contentRes) {
//     return <div></div>;
//   }
//   const { last_edited_time, properties } = blogRes;
//   const { Page, authors, tags } = properties;

//   const contentList: BlockObjectResponse[] =
//     (contentRes?.results as unknown as BlockObjectResponse[]) || [];
//   return (
//     <>
//       <Head>
//         <title>{Page.title.map((item) => item.plain_text)}</title>
//       </Head>
//       <h1>{Page.title.map((item) => item.plain_text)}</h1>
//       <div className="list-item-meta">
//         <NeuDiv intensity="sm" className="list-item-author">
//           {authors.people.map((author) => author.name).join("/")}
//         </NeuDiv>
//         {tags.multi_select.length && (
//           <ul className="list-item-tags">
//             {origin && <Tag>来源: {origin}</Tag>}
//             {tags.multi_select.map((tag) => {
//               return (
//                 <Tag style={{ color: tag.color }} key={tag.id}>
//                   {tag.name}
//                 </Tag>
//               );
//             })}
//             {last_edited_time && (
//               <Tag>
//                 {format(new Date(last_edited_time), "yyyy-MM-dd HH:mm:ss")}
//               </Tag>
//             )}
//           </ul>
//         )}
//       </div>
//       <div className="blog-content">
//         {!contentList.length ? (
//           <div className="blog-empty-content">
//             <NeuDiv className="blog-empty-title">
//               这篇博客没有内容, 所以给你看看我的小猫吧~
//             </NeuDiv>
//             <NeuDiv className="blog-empty-image">
//               <div>
//                 <Image
//                   layout="responsive"
//                   src="/img/myCat.jpg"
//                   alt="my cat"
//                   width={100}
//                   height={100}
//                   objectFit="cover"
//                 />
//               </div>
//             </NeuDiv>
//           </div>
//         ) : (
//           contentList.map((content) => {
//             if (content.type in NotionBlock) {
//               return (NotionBlock as any)[content.type](content);
//             }
//           })
//         )}
//       </div>
//     </>
//   );
// };

// export default PostLayout;
const Blog = () => {
  return <div>Blog</div>;
};

export default Blog;

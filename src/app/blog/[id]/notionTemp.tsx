// "use server";

// import Head from "next/head";

// import NeuDiv from "@/components/NeuDiv/NeuDiv";
// import Tag from "@/components/Tag/tag";

// import NotionBlock from "@/components/NotionBlock/notionBlock";

// import Image from "next/image";

// import { blogData } from "./data";
// import { getBlogById } from "@/db/blogAction";

// // export async function getStaticProps({ params }: { params: { id: number } }) {
// //   const postData = await getBlogById(params.id);
// //   console.log("postData", postData);
// // }

// const Blog = async ({ params }: { params: Promise<{ id: number }> }) => {
//   const { id } = await params;
//   const postData = await getBlogById(id);

//   const { last_edited_time, properties } = blogData.pageProps.blogRes;
//   const { Page, authors, tags } = properties;

//   const contentList: any[] =
//     (blogData.pageProps.contentRes?.results as any[]) || [];
//   return (
//     <div className="px-[5%] pt-10 pb-15 border-x overflow-auto h-[calc(100vh-5rem)] hide-scrollbar">
//       <Head>
//         <title>{Page.title.map((item) => item.plain_text)}</title>
//       </Head>
//       <h1>{Page.title.map((item) => item.plain_text)}</h1>
//       <div className="flex flex-wrap items-center justify-between">
//         <Tag className="ml-0">
//           {authors.people.map((author) => author.name).join("/")}
//         </Tag>
//         {tags.multi_select.length && (
//           <ul className="flex flex-wrap gap-1 p-0 mx-0 my-3">
//             {/* {origin && <Tag>来源: {origin}</Tag>} */}
//             {tags.multi_select.map((tag) => {
//               return (
//                 <Tag color={tag.color} key={tag.id}>
//                   {tag.name}
//                 </Tag>
//               );
//             })}
//             {last_edited_time && (
//               <Tag>{(new Date(last_edited_time), "yyyy-MM-dd HH:mm:ss")}</Tag>
//             )}
//           </ul>
//         )}
//       </div>
//       <div className="text-left">
//         {!contentList.length ? (
//           <div className="blog-empty-content">
//             <NeuDiv className="blog-empty-title">
//               未找到博客, 所以给你看看我的小猫吧~
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
//               return (
//                 <section key={content.id} className="">
//                   {(NotionBlock as any)[content.type](content)}
//                 </section>
//               );
//             }
//           })
//         )}
//       </div>
//     </div>
//   );
// };

// export default Blog;

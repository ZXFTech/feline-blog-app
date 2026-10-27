/* eslint-disable @next/next/no-img-element -- Markdown retains safe arbitrary image URLs and original dimensions. */
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { CodeBlock } from "@/components/Blog/CodeBlock";
import { cn } from "@/lib/utils";

export interface BlogMarkdownProps {
  content: string;
  id?: string;
  className?: string;
}

type MarkdownNode =
  | NonNullable<ExtraProps["node"]>
  | NonNullable<ExtraProps["node"]>["children"][number];

function nodeText(node: MarkdownNode): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(nodeText).join("") : "";
}

const components: Components = {
  pre({ node }) {
    const codeNode = node?.children.find(
      (child) => child.type === "element" && child.tagName === "code"
    );
    const classes = codeNode?.type === "element" ? codeNode.properties.className : undefined;
    const className = Array.isArray(classes) ? classes.join(" ") : String(classes ?? "");
    return (
      <CodeBlock
        code={codeNode ? nodeText(codeNode) : ""}
        language={/(?:^|\s)language-([^\s]+)/.exec(className)?.[1]}
      />
    );
  },
  table({ children }) {
    return (
      <div className="blog-table-scroll p-0" role="region" aria-label="表格" tabIndex={0}>
        <table>{children}</table>
      </div>
    );
  },
  img({ src, alt, title, width, height }) {
    // Markdown images retain source dimensions and the default URL safety policy.
    return (
      <img src={src} alt={alt ?? ""} title={title} width={width} height={height} loading="lazy" />
    );
  },
};

export function BlogMarkdown({ content, id, className }: BlogMarkdownProps) {
  return (
    <div id={id} className={cn("blog-markdown min-w-0 max-w-full", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

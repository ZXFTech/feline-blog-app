"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Prism as Highlighter, type SyntaxHighlighterProps } from "react-syntax-highlighter";
import CopyButton from "@/components/CopyButton/copyButton";
import Tag from "@/components/Tag";
import { Button } from "@/components/ui/button";
import { NeuPanel } from "@/components/ui/neu-panel";

export interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

type HighlightNode = Parameters<NonNullable<SyntaxHighlighterProps["renderer"]>>[0]["rows"][number];
interface Segment {
  text: string;
  group: string;
}

const aliases: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  sh: "bash",
  shell: "bash",
  "c++": "cpp",
  "c#": "csharp",
  html: "markup",
  md: "markdown",
};
const supported = new Set(Highlighter.supportedLanguages);

function flatten(nodes: HighlightNode[], inherited = ""): Segment[] {
  return nodes.flatMap((node) => {
    if (node.type === "text") return [{ text: String(node.value ?? ""), group: inherited }];
    const classes: unknown[] = node.properties?.className ?? [];
    const group = classes.some((name) =>
      ["comment", "prolog", "doctype", "cdata"].includes(String(name))
    )
      ? "comment"
      : classes.some((name) => ["string", "char", "attr-value"].includes(String(name)))
        ? "string"
        : classes.some((name) => ["keyword", "builtin", "boolean"].includes(String(name)))
          ? "keyword"
          : inherited;
    return flatten(node.children ?? [], group);
  });
}

function codeRows(nodes: HighlightNode[], code: string): ReactNode {
  if (!code) return null;
  let segments = flatten(nodes).filter((segment) => segment.text.length > 0);
  // Never let a highlighter normalization change the displayed source.
  if (segments.map((segment) => segment.text).join("") !== code)
    segments = [{ text: code, group: "" }];
  const lines = code.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) ?? [];
  if (lines.at(-1) === "") lines.pop();
  let segmentIndex = 0;
  let offset = 0;
  return lines.map((line, index) => {
    let remaining = line.length;
    const parts: ReactNode[] = [];
    while (remaining > 0) {
      const segment = segments[segmentIndex];
      const length = Math.min(remaining, segment.text.length - offset);
      parts.push(
        <span key={parts.length} className={segment.group ? `token ${segment.group}` : undefined}>
          {segment.text.slice(offset, offset + length)}
        </span>
      );
      offset += length;
      remaining -= length;
      if (offset === segment.text.length) {
        segmentIndex += 1;
        offset = 0;
      }
    }
    return (
      <span className="blog-code-line" key={index}>
        <span className="blog-code-line-number" aria-hidden="true" data-line-number={index + 1} />
        <span className="blog-code-line-text">{parts}</span>
      </span>
    );
  });
}

function selectCodeOnShortcut(event: KeyboardEvent<HTMLPreElement>) {
  if (
    event.defaultPrevented ||
    event.target !== event.currentTarget ||
    !(event.ctrlKey || event.metaKey) ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== "a"
  )
    return;
  const document = event.currentTarget.ownerDocument;
  const source = event.currentTarget.querySelector("code");
  const selection = document.getSelection();
  if (!source || !selection) return;
  const range = document.createRange();
  range.selectNodeContents(source);
  selection.removeAllRanges();
  selection.addRange(range);
  event.preventDefault();
}

function CodeContent({ code, language }: Pick<CodeBlockProps, "code" | "language">) {
  const [wrap, setWrap] = useState(false);
  const name = language?.toLowerCase() ?? "";
  const syntax = aliases[name] ?? name;
  const known = supported.has(syntax);
  const label =
    !name || name === "text" || name === "plain" || name === "plaintext"
      ? "纯文本"
      : known
        ? language
        : `${language}（纯文本）`;

  return (
    <>
      <div className="blog-code-toolbar">
        <Tag className="blog-code-language">{label}</Tag>
        <div className="blog-code-actions">
          <Button
            type="button"
            size="icon"
            materialIcon="wrap_text"
            variant={wrap ? "primary" : "default"}
            className="blog-code-wrap"
            aria-label="自动换行"
            title={wrap ? "关闭自动换行" : "开启自动换行"}
            aria-pressed={wrap}
            onClick={() => setWrap((value) => !value)}
          />
          <CopyButton code={code} />
        </div>
      </div>
      <Highlighter
        language={known ? syntax : "text"}
        style={{}}
        useInlineStyles={false}
        wrapLines={false}
        codeTagProps={{ className: "blog-code-source" }}
        className="blog-code-pre p-0"
        data-wrap={wrap}
        tabIndex={0}
        onKeyDown={selectCodeOnShortcut}
        role="region"
        aria-label="代码"
        renderer={({ rows }) => codeRows(rows, code)}
      >
        {code}
      </Highlighter>
    </>
  );
}

export function CodeBlock({ code, language, title }: CodeBlockProps) {
  return (
    <NeuPanel elevation="inset-sm" className="blog-code min-w-0 max-w-full" density="default">
      {title ? <div className="blog-code-title">{title}</div> : null}
      <CodeContent key={JSON.stringify([code, language])} code={code} language={language} />
    </NeuPanel>
  );
}

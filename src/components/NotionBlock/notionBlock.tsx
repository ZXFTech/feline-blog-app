import CopyButton from "@/components/CopyButton/copyButton";
import NeuDiv from "@/components/NeuDiv/NeuDiv";
import Tag from "@/components/Tag/tag";

import Image from "next/image";
import React, { FC } from "react";
import { Prism as Highlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/cjs/styles/prism";

export interface BlockFormatterProps {
  block: any;
}

const combineRichText = (richText: any[]) => {
  return richText.map((item) => item.plain_text).join(" ");
};

const CodeBlock: FC<{ title?: string; code: string; language: string }> = ({
  code,
  title,
  language,
}) => {
  return (
    <NeuDiv neuType="debossed" className="w-full !mx-0">
      <div suppressHydrationWarning className="flex justify-between">
        <div className="flex gap-1">
          {title && <Tag>{title}</Tag>}
          <Tag>{language}</Tag>
        </div>
        <CopyButton code={code} />
      </div>
      <Highlighter
        showLineNumbers
        wrapLines
        style={dracula}
        wrapLongLines
        language={language}
      >
        {code.trim()}
      </Highlighter>
    </NeuDiv>
  );
};

const NotionBlock = {
  heading_1: (block: any) => {
    return (
      <h1 key={block.id} className="blog-heading-1">
        {combineRichText(block.heading_1.rich_text)}
      </h1>
    );
  },

  heading_2: (block: any) => {
    return (
      <h2 key={block.id} className="blog-heading-2">
        {combineRichText(block.heading_2.rich_text)}
      </h2>
    );
  },
  heading_3: (block: any) => {
    return (
      <h3 key={block.id} className="blog-heading-3">
        {combineRichText(block.heading_3.rich_text)}
      </h3>
    );
  },
  paragraph: (block: any) => {
    return (
      <p key={block.id} className="blog-paragraph">
        {combineRichText(block.paragraph.rich_text)}
      </p>
    );
  },
  divider: (block: any) => {
    return <br key={block.id} className="blog-divider" />;
  },
  bulleted_list_item: (block: any) => {
    return (
      <li key={block.id}>
        {combineRichText(block.bulleted_list_item.rich_text)}
      </li>
    );
  },
  numbered_list_item: (block: any) => {
    return (
      <li key={block.id}>
        {combineRichText(block.numbered_list_item.rich_text)}
      </li>
    );
  },
  image: (block: any) => {
    switch (block.image.type) {
      case "external":
        return (
          <div key={block.id} className="blog-image-container">
            <Image
              className="blog-image"
              fill
              objectFit="contain"
              src={block.image.external.url}
              alt={block.image.caption.join(" ")}
            />
          </div>
        );
      case "file":
        return (
          <div key={block.id} className="blog-image-container">
            <Image
              className="blog-image"
              objectFit="contain"
              fill
              src={block.image.file.url}
              alt={block.image.caption.join(" ")}
            />
          </div>
        );
    }
  },
  code: (block: any) => {
    return (
      <CodeBlock
        key={block.id}
        title={combineRichText(block.code.caption)}
        code={combineRichText(block.code.rich_text)}
        language={block.code.language}
      />
    );
  },
  to_do: (block: any) => {
    const data = block.to_do;
    return (
      <div key={block.id}>
        <input type="checkbox" readOnly checked={data.checked} />
        {combineRichText(data.rich_text)}
      </div>
    );
  },
};

export default NotionBlock;

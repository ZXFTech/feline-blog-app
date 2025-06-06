import CopyButton from "@/components/CopyButton/copyButton";
import NeuDiv from "@/components/NeuDiv/NeuDiv";
import Tag from "@/components/Tag/tag";

import Image from "next/image";
import React, { FC } from "react";
import { Prism as Highlighter } from "react-syntax-highlighter";
import { dracula } from "react-syntax-highlighter/dist/cjs/styles/prism";

export interface BlockFormatterProps {
  block: unknown;
}

export interface Block {
  id: string;
  heading_1: { rich_text: { plain_text: string }[] };
  heading_2: { rich_text: { plain_text: string }[] };
  heading_3: { rich_text: { plain_text: string }[] };
  paragraph: { rich_text: { plain_text: string }[] };
  bulleted_list_item: { rich_text: { plain_text: string }[] };
  numbered_list_item: { rich_text: { plain_text: string }[] };
  image: {
    type: string;
    external: { url: string };
    file: { url: string };
    caption: string[];
  };
  code: {
    caption: { plain_text: string }[];
    rich_text: { plain_text: string }[];
    language: string;
  };
  to_do: {
    checked: boolean;
    rich_text: { plain_text: string }[];
  };
}

const combineRichText = (richText: { plain_text: string }[]) => {
  return richText.map((item) => item.plain_text).join(" ");
};

export const CodeBlock: FC<{
  title?: string;
  code: string;
  language: string;
}> = ({ code, title, language }) => {
  return (
    <NeuDiv neuType="debossed" className="w-full mx-0">
      <div suppressHydrationWarning className="flex justify-between">
        <div className="flex gap-1">
          {title && (
            <Tag>
              <span className="font-bold">{title}</span>
            </Tag>
          )}
          <Tag className="font-bold!">
            <span className="font-bold">{language}</span>
          </Tag>
        </div>
        <CopyButton code={code} />
      </div>
      <Highlighter
        showLineNumbers
        wrapLines
        style={dracula}
        wrapLongLines
        language={language.toLowerCase()}
      >
        {code.trim()}
      </Highlighter>
    </NeuDiv>
  );
};

const NotionBlock = {
  heading_1: (block: Block) => {
    return <h1 key={block.id}>{combineRichText(block.heading_1.rich_text)}</h1>;
  },

  heading_2: (block: Block) => {
    return <h2 key={block.id}>{combineRichText(block.heading_2.rich_text)}</h2>;
  },
  heading_3: (block: Block) => {
    return <h3 key={block.id}>{combineRichText(block.heading_3.rich_text)}</h3>;
  },
  paragraph: (block: Block) => {
    return <p key={block.id}>{combineRichText(block.paragraph.rich_text)}</p>;
  },
  divider: (block: Block) => {
    return (
      <hr
        key={block.id}
        className="border-t-1 my-0.5 text-gray-500 scale-y-50"
      />
    );
  },
  bulleted_list_item: (block: Block) => {
    return (
      <li key={block.id}>
        {combineRichText(block.bulleted_list_item.rich_text)}
      </li>
    );
  },
  numbered_list_item: (block: Block) => {
    return (
      <li key={block.id}>
        {combineRichText(block.numbered_list_item.rich_text)}
      </li>
    );
  },
  image: (block: Block) => {
    // todo: 可手动缩放图片大小
    switch (block.image.type) {
      case "external":
        return (
          <NeuDiv key={block.id} className="mx-[auto] mt-0 mb-3 w-[70%] !p-0.5">
            <Image
              className="m-0 rounded-md object-contain"
              width={2000}
              height={2000}
              src={block.image.external.url}
              alt={block.image.caption.join(" ")}
            />
          </NeuDiv>
        );
      case "file":
        return (
          <NeuDiv
            key={block.id}
            className="mx-[auto] mt-0 mb-3 w-[70%] !p-0.5  "
          >
            <Image
              className="m-0 rounded-md !object-cover"
              width={2000}
              height={2000}
              src={block.image.file.url}
              alt={block.image.caption.join(" ")}
            />
          </NeuDiv>
        );
    }
  },
  code: (block: Block) => {
    return (
      <CodeBlock
        key={block.id}
        title={combineRichText(block.code.caption)}
        code={combineRichText(block.code.rich_text)}
        language={block.code.language}
      />
    );
  },
  to_do: (block: Block) => {
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

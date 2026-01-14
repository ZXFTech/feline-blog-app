"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NeuButton from "../NeuButton";
import NeuDiv from "../NeuDiv";
import Tag from "../Tag";
import NeuInput from "../NeuInput";
import ColorPanel from "../ColorPanel";
import { Tag as ITag } from "../../../generated/prisma/client";
import classNames from "classnames";
import Icon from "../Icon";

export type TagData = MakeOptional<
  ITag,
  "id" | "createdAt" | "updatedAt" | "userId"
>;
export type TagsOnTodo = {
  todoId: number;
  tagId: number;
  assignedAt: string;
  assignedBy: string;
  tag: {
    id: number;
    content: string;
    color: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
  };
};

type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

const isContain = (targetTag: TagData) => {
  return (comparedTag: TagData) => {
    return targetTag.content === comparedTag.content;
  };
};

// 暂时用不上，用于区分 新增的 tag 和已有的 tag
const splitExistArray = <T,>(
  list: T[],
  func: (item: T) => boolean
): [T | undefined, T[], T[]] => {
  const existedTag = list.find((item) => func(item));
  return [
    existedTag,
    list.filter((item) => !func(item)),
    list.filter((item) => func(item)),
  ];
};

interface Props {
  value: TagData[];
  options: TagData[];
  setValue: (tagData: TagData[]) => void;
  allowCreate?: boolean;
}

const TagEditor = ({
  value = [],
  setValue,
  options = [],
  allowCreate = true,
}: Props) => {
  const [visible, setVisible] = useState(false);
  const [tagValue, setTagValue] = useState<string>("");
  const [tagColor, setTagColor] = useState<string>("");
  const [highlight, setHighlight] = useState<boolean>(false);

  const [shake, setShake] = useState<boolean>(false);

  const [optionTags, setOptionTags] = useState<TagData[]>(options);

  useEffect(() => {
    setOptionTags(options);
  }, [options]);

  const filteredTags = useMemo(() => {
    if (allowCreate) {
      return optionTags
        .filter((item) => item.content.includes(tagValue))
        .slice(0, 20);
    }
    // 不允许新增则显示全部
    return optionTags.filter((item) => item.content.includes(tagValue));
  }, [optionTags, tagValue, allowCreate]);

  const tagContentInput = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const resetState = () => {
    setTagColor("");
    setTagValue("");
    setVisible(false);
    setShake(false);
    setHighlight(false);
  };

  const handleRemoveTag = (targetTag: TagData) => {
    setValue([...value.filter((tag) => tag.content !== targetTag.content)]);
    setOptionTags((prev) => [targetTag].concat(prev));
    resetState();
  };

  const updateTags = () => {
    // 更新 todo 标签
    if (!tagValue) {
      setHighlight(true);
      setShake(false);
      requestAnimationFrame(() => setShake(true));
      return;
    }

    // 检查是否为已包含
    const searchResult = value.find((tag) => tag.content === tagValue);
    if (searchResult) {
      // 包含则更新
      searchResult.color = tagColor;
    } else {
      // 检查是否为未包含但已创建
      const optionResult = optionTags.find((tag) => tag.content === tagValue);
      if (optionResult) {
        // 是已创建则更新颜色后添加, 并从可选 tag 中移除
        value.push({
          ...optionResult,
          color: tagColor,
        });
        setOptionTags((prev) =>
          prev.filter((item) => item.content !== tagValue)
        );
      } else {
        // 新增 tag, 正常处理
        value.push({
          content: tagValue,
          color: tagColor,
        });
      }
    }
    setValue([...value]);
    resetState();
  };

  return (
    <NeuDiv className="tag-editor-container w-[100%] mb-4 p-0">
      <div className="tags flex flex-wrap gap-1 m-0! mb-2!">
        {value.map((tag, index) => (
          <Tag
            key={tag.id + tag.content + index}
            color={tag.color}
            closable
            onClose={() => handleRemoveTag(tag)}
          >
            {tag.content}
          </Tag>
        ))}
      </div>
      {allowCreate ? (
        <div className="tag-editor flex flex-wrap items-center justify-end mb-2 min-h-9">
          <div
            className={classNames(
              "flex flex-wrap items-center justify-end max-h-9 min-h-9 transition duration-300",
              // "scale-x-[95%]",
              "opacity-0",
              { "opacity-100": visible },
              { "scale-x-[100%]": visible }
            )}
          >
            <NeuInput
              style={{ color: tagColor }}
              className={`font-medium! mr-1 ${highlight && "border-red-600!"} ${
                shake ? "input-shake" : ""
              }`}
              inputSize="xs"
              value={tagValue}
              ref={tagContentInput}
              onChange={(e) => {
                setHighlight(false);
                setTagValue(e.target.value);
              }}
            />
            <ColorPanel
              onColorPicked={(value) => setTagColor(value)}
              colorFilter={{ i: 5, j: 3 }}
              color={tagColor}
              setColor={setTagColor}
            />
            <NeuButton icon="check" onClick={updateTags}></NeuButton>
          </div>
          {/* <NeuButton
            icon="close"
            onClick={() => {
              resetState();
            }}
          ></NeuButton> */}
          <NeuButton
            className="p-1!"
            style={{ lineHeight: 0 }}
            onClick={() => {
              if (!visible) {
                tagContentInput.current?.focus();
                setVisible((prev) => !prev);
              } else {
                resetState();
                setTagColor("");
              }
            }}
          >
            <Icon
              icon="add"
              className={classNames("transition-transform duration-200", {
                "rotate-45": visible,
              })}
            />
          </NeuButton>
        </div>
      ) : null}
      <NeuDiv
        neuType="debossed"
        className="flex gap-1 flex-wrap items-start min-h-23"
      >
        {(filteredTags || []).map((tag) => {
          return (
            <Tag
              onClick={() => {
                setValue(value.concat(tag));
                setOptionTags((prev) =>
                  prev.filter((item) => item.content !== tag.content)
                );
                resetState();
              }}
              key={tag.id + tag.content}
              color={tag.color}
            >
              {tag.content}
            </Tag>
          );
        })}
      </NeuDiv>

      {/* <Modal visible={visible} onClose={handleCancel} onOk={handleOk}></Modal> */}
    </NeuDiv>
  );
};

export default TagEditor;

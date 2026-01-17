"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  defaultOpen?: boolean;
}

const TagEditor = ({
  value = [],
  setValue,
  options = [],
  allowCreate = true,
  defaultOpen = false,
}: Props) => {
  const [visible, setVisible] = useState(false);
  const [tagValue, setTagValue] = useState<string>("");
  const [tagColor, setTagColor] = useState<string>("");
  const [highlight, setHighlight] = useState<boolean>(false);

  const [shake, setShake] = useState<boolean>(false);

  const [optionTags, setOptionTags] = useState<TagData[]>(options);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisible(defaultOpen);
  }, [defaultOpen]);

  useLayoutEffect(() => {
    const el = ref.current!;
    if (!visible) {
      el.style.height = 0 + "px";
    } else {
      el.style.height = el.scrollHeight + "px";
      tagContentInput.current?.focus({ preventScroll: true });
    }
  }, [visible]);

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
      tagContentInput.current?.focus();
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
      {value.length ? (
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
      ) : null}
      <div>
        <NeuButton
          className="p-1!"
          style={{ lineHeight: 0 }}
          onClick={() => {
            if (visible) {
              resetState();
              setTagColor("");
            }
            setVisible((prev) => !prev);
          }}
        >
          <Icon
            icon="add"
            className={classNames("transition-transform duration-500", {
              "rotate-45": visible,
            })}
          />
        </NeuButton>
      </div>
      <div
        ref={ref}
        className={classNames(
          "overflow-hidden transition-[height] duration-500"
        )}
      >
        {allowCreate ? (
          <div
            className={classNames("flex flex-wrap items-center justify-end")}
          >
            <NeuInput
              style={{ color: tagColor }}
              className={`bg-red-500! mr-1 my-2 font-medium! ${
                highlight && "border-red-600!"
              } ${shake ? "input-shake" : ""}`}
              inputSize="xs"
              value={tagValue}
              ref={tagContentInput}
              onBlur={() => {
                setShake(false);
                setHighlight(false);
              }}
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
        ) : null}
        <NeuDiv neuType="debossed" className="flex gap-1 flex-wrap items-start">
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
      </div>
    </NeuDiv>
  );
};

export default TagEditor;

"use client";

import { Dispatch, SetStateAction, useRef, useState } from "react";
import NeuButton from "../NeuButton";
import NeuDiv from "../NeuDiv";
import Tag from "../Tag";
import NeuInput from "../NeuInput";
import ColorPanel from "../ColorPanel";
import { Tag as ITag } from "../../../generated/prisma/client";

export type TagData = Pick<ITag, "content" | "color"> & { id?: number };

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
  setValue: (tagData: TagData[]) => void;
}

const TagEditor = ({ value = [], setValue }: Props) => {
  const [visible, setVisible] = useState(false);
  const [tagValue, setTagValue] = useState<string>("");
  const [tagColor, setTagColor] = useState<string>("");
  const [panelVisible, setPanelVisible] = useState(false);

  const tagContentInput = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const resetState = () => {
    setTagColor("");
    setTagValue("");
    setVisible(false);
  };

  const handleRemoveTag = (targetTag: TagData) => {
    setValue([...value.filter((tag) => tag.content !== targetTag.content)]);
  };

  const updateTags = () => {
    // 更新 todo 标签
    const searchResult = value.find((tag) => tag.content === tagValue);
    if (searchResult) {
      searchResult.color = tagColor;
    } else {
      value.push({
        content: tagValue,
        color: tagColor,
      });
    }
    setValue([...value]);
    setTagValue("");
    setTagColor("");
    setVisible(false);
  };

  return (
    <NeuDiv className="tag-editor-container w-[100%] max-w-120 mb-4 p-0">
      <div className="tags flex flex-wrap gap-1 m-0! mb-2!">
        {value.map((tag, index) => (
          <Tag
            key={tag.id + tag.content! + index}
            color={tag.color}
            closable
            onClose={() => handleRemoveTag(tag)}
          >
            {tag.content}
          </Tag>
        ))}
      </div>
      <div className="tag-editor flex flex-wrap justify-end">
        {visible ? (
          <>
            <NeuInput
              style={{ color: tagColor }}
              className="font-medium!"
              inputSize="xs"
              value={tagValue}
              ref={tagContentInput}
              onChange={(e) => setTagValue(e.target.value)}
            />
            <ColorPanel
              visible={panelVisible}
              setVisible={setPanelVisible}
              onColorPicked={(value) => setTagColor(value)}
            >
              <NeuButton
                className="inline-block"
                style={{ color: tagColor }}
                icon="format_color_text"
                onClick={() => setPanelVisible!((prev) => !prev)}
              ></NeuButton>
            </ColorPanel>
            <NeuButton icon="check" onClick={updateTags}></NeuButton>
            <NeuButton
              icon="close"
              onClick={() => {
                resetState();
              }}
            ></NeuButton>
          </>
        ) : (
          <NeuButton
            icon="add"
            onClick={() => {
              setVisible(true);
              tagContentInput.current?.focus();
            }}
          />
        )}
      </div>

      {/* <Modal visible={visible} onClose={handleCancel} onOk={handleOk}></Modal> */}
    </NeuDiv>
  );
};

export default TagEditor;

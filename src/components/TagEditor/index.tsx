"use client";

import { Dispatch, SetStateAction, useState } from "react";
import { Tag as ITag } from "../../../generated/prisma";
import NeuButton from "../NeuButton/neuButton";
import NeuDiv from "../NeuDiv/NeuDiv";
import Tag from "../Tag/tag";
import NeuInput from "../NeuInput";
import ColorPanel from "../ColorPanel";
import { TagsCollection, TagData } from "@/app/page";

const splitExistArray = <T,>(
  list: T[],
  func: (item: T) => boolean
): [T | undefined, T[]] => {
  const updatedTag = list.find(func);
  return [updatedTag, list.filter(func)];
};

interface Props {
  value?: TagsCollection;
  setValue: Dispatch<SetStateAction<TagsCollection>>;
}

const TagEditor = ({
  value = {
    originTags: [],
    removedTags: [],
    addedTags: [],
    updatedTags: [],
  },
  setValue,
}: Props) => {
  const [visible, setVisible] = useState(false);
  const [tagValue, setTagValue] = useState<string>("");
  const [tagColor, setTagColor] = useState<string>("");
  const [panelVisible, setPanelVisible] = useState(false);

  const compareFunc = (item: TagData) => item.content === tagValue;

  const { originTags, removedTags, addedTags, updatedTags } = value;

  const handleCancel = () => {
    setVisible(false);
  };

  const handleOk = () => {
    setVisible(false);
  };

  const resetState = () => {
    setTagColor("");
    setTagValue("");
    setVisible(false);
  };

  const handleRemoveTag = () => {
    const updatedTagList = value.originTags.filter(
      (item) => item.content !== tag.content
    );
    setValue((prev) => ({
      ...prev,
      originTags: updatedTagList,
      removedTags: value.removedTags.concat([tag]),
    }));
  };

  const updateTags = () => {
    if (!tagValue) {
      return;
    }

    // 判断 originTagList 是否包含 tagValue
    const [originTag, newOriginTags] = splitExistArray(originTags, compareFunc);

    if (originTag) {
      // 如果存在 tag ,则更新 tag, 从 originTags 里移除, 加入 updatedList
      setValue((prev) => ({
        ...prev,
        originTags: newOriginTags,
        updatedTags: updatedTags.concat({
          ...originTag,
          color: tagColor || originTag.color,
        }),
      }));
      resetState();
      return;
    }

    // 判断 updatedTags 是否包含同 tagValue 的 tag
    const [addedTag, newAddedTags] = splitExistArray(addedTags, compareFunc);

    if (addedTag) {
      // 在 addedTagList 中, 因为不涉及服务端操作, 去除即可
      setValue((prev) => ({
        ...prev,
        addedTags: newAddedTags,
      }));
      resetState();
      return;
    }

    // 判断 updatedTags 是否包含同 tagValue 的 tag
    const [updatedTag, newUpdatedTags] = splitExistArray(
      updatedTags,
      compareFunc
    );

    if (updatedTag) {
      // 在 updatedTags 中, 更新
      setValue((prev) => ({
        ...prev,
        updatedTagList: newUpdatedTags,
      }));
      resetState();
      return;
    }

    // 判断 removedTags 中是否包含
    const [removedTag, newRemovedTags] = splitExistArray(
      removedTags,
      compareFunc
    );

    if (removedTag) {
      // 在 removedTags 中, removedTags 中的均为服务端已存在的, 所以添加到 originTags 中
      setValue((prev) => ({
        ...prev,
        removedTags: newRemovedTags,
        originTags: originTags.concat(removedTag),
      }));
      resetState();
      return;
    }
  };

  return (
    <div className="tag-editor-container w-[100%] m-1">
      <NeuDiv className="tags flex flex-wrap gap-1 m-1! mb-4!">
        {value.originTags.map((tag, index) => (
          <Tag
            key={tag.id + tag.content! + index}
            color={tag.color}
            closable
            onClose={handleRemoveTag}
          >
            {tag.content}
          </Tag>
        ))}
      </NeuDiv>
      <div className="tag-editor flex flex-wrap gap-1 justify-end">
        {visible ? (
          <>
            <NeuInput
              style={{ color: tagColor }}
              className="font-medium!"
              inputSize="xs"
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
            />
            <ColorPanel
              visible={panelVisible}
              setVisible={setPanelVisible}
              onColorPicked={(value) => setTagColor(value)}
              defaultColor={tagColor}
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
                setTagValue("");
                setTagColor("");
                setVisible(false);
              }}
            ></NeuButton>
          </>
        ) : (
          <NeuButton
            icon="add"
            onClick={() => {
              setVisible(true);
            }}
          ></NeuButton>
        )}
      </div>

      {/* <Modal visible={visible} onClose={handleCancel} onOk={handleOk}></Modal> */}
    </div>
  );
};

export default TagEditor;

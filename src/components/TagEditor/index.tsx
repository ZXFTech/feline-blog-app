"use client";

import { Dispatch, SetStateAction, useState } from "react";
import NeuButton from "../NeuButton/neuButton";
import NeuDiv from "../NeuDiv/NeuDiv";
import Tag from "../Tag/tag";
import NeuInput from "../NeuInput";
import ColorPanel from "../ColorPanel";
import { TagsCollection, TagData } from "@/app/page";

const isContain = (targetTag: TagData) => {
  return (comparedTag: TagData) => {
    return targetTag.content === comparedTag.content;
  };
};

const splitExistArray = <T,>(
  list: T[],
  func: (item: T) => boolean
): [T | undefined, T[], T[]] => {
  const existedTag = list.find((item) => func(item));
  console.log(list.filter((item) => func(item)));
  return [
    existedTag,
    list.filter((item) => !func(item)),
    list.filter((item) => func(item)),
  ];
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

  const { originTags, removedTags, addedTags, updatedTags } = value;

  const resetState = () => {
    setTagColor("");
    setTagValue("");
    setVisible(false);
  };

  const handleRemoveTag = (targetTag: TagData) => {
    // 如果是从 originTags 中删除
    const [originTag, newOriginTags] = splitExistArray(
      originTags,
      isContain(targetTag)
    );
    if (originTag) {
      // 从 originTags 中删除, 涉及服务端操作, 记录进 removedTags
      setValue((prev) => ({
        ...prev,
        originTags: newOriginTags,
        removedTags: removedTags.concat(originTag),
      }));
      return;
    }
    // 如果是从 updatedTags 中删除
    const [updatedTag, newUpdatedTags] = splitExistArray(
      updatedTags,
      isContain(targetTag)
    );
    if (updatedTag) {
      // 涉及服务端操作, 记录进 removeTags
      setValue((prev) => ({
        ...prev,
        updatedTags: newUpdatedTags,
        removedTags: removedTags.concat(updatedTag),
      }));
      return;
    }
    // 如果是从 addedTag 中删除
    const [addedTag, newAddedTags] = splitExistArray(
      addedTags,
      isContain(targetTag)
    );
    if (addedTag) {
      // 涉及服务端操作, 记录进 removeTags
      setValue((prev) => ({
        ...prev,
        addedTags: newAddedTags,
        removedTags: removedTags.concat(addedTag),
      }));
      return;
    }
  };

  const updateTags = () => {
    if (!tagValue) {
      resetState();
      return;
    }

    const newTag = { content: tagValue, color: tagColor };

    // 判断 originTagList 是否包含 tagValue
    const [originTag, newOriginTags] = splitExistArray(
      originTags,
      isContain(newTag)
    );
    console.log("originTag", originTag);
    console.log("newOriginTags", newOriginTags);
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
    const [updatedTag, newUpdatedTags] = splitExistArray(
      updatedTags,
      isContain(newTag)
    );
    console.log("newUpdatedTags", newUpdatedTags);
    console.log("updatedTag", updatedTag);
    console.log("newTag", newTag);
    console.log("{...updatedTag,...newTag}", { ...updatedTag, ...newTag });
    console.log(
      "newUpdatedTags.concat({ ...updatedTag, ...newTag }",
      newUpdatedTags.concat({ ...updatedTag, ...newTag })
    );
    if (updatedTag) {
      // 在 updatedTags 中, 更新
      setValue((prev) => ({
        ...prev,
        updatedTags: [...newUpdatedTags, { ...updatedTag, ...newTag }],
      }));
      resetState();
      return;
    }

    // 判断 updatedTags 是否包含同 tagValue 的 tag
    const [addedTag] = splitExistArray(addedTags, isContain(newTag));
    if (addedTag) {
      // 在 addedTagList 中, 更新
      setValue((prev) => ({
        ...prev,
        addedTags: addedTags.map((tag) =>
          tag.content === addedTag.content ? { ...tag, ...newTag } : tag
        ),
      }));
      resetState();
      return;
    }

    // 判断 removedTags 中是否包含
    const [removedTag, newRemovedTags] = splitExistArray(
      removedTags,
      isContain(newTag)
    );
    if (removedTag) {
      // 在 removedTags 中, 如果 id 有值, 则是服务端已存在的, 添加到 originTags 中, id 为 undefined, 则是本次新增, 放入 addedTags 中
      if (removedTag.id) {
        setValue((prev) => ({
          ...prev,
          removedTags: newRemovedTags,
          originTags: originTags.concat({ ...removedTag, ...newTag }),
        }));
      } else {
        setValue((prev) => ({
          ...prev,
          removedTags: newRemovedTags,
          addedTags: addedTags.concat({ ...removedTag, ...newTag }),
        }));
      }

      resetState();
      return;
    }

    // 都不存在, 则为首次新增, 直接添加到 addedTags
    setValue((prev) => ({
      ...prev,
      addedTags: addedTags.concat(newTag),
    }));
    resetState();
    return;
  };

  return (
    <div className="tag-editor-container w-[100%] m-1">
      <NeuDiv className="tags flex flex-wrap gap-1 m-1! mb-4!">
        {[...originTags, ...updatedTags, ...addedTags].map((tag, index) => (
          <Tag
            key={tag.id + tag.content! + index}
            color={tag.color}
            closable
            onClose={() => handleRemoveTag(tag)}
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
            }}
          ></NeuButton>
        )}
      </div>

      {/* <Modal visible={visible} onClose={handleCancel} onOk={handleOk}></Modal> */}
    </div>
  );
};

export default TagEditor;

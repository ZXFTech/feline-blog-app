"use client";

import Content from "@/components/Content";
import NeuButton from "@/components/NeuButton";
import NeuInput from "@/components/NeuInput";
import { toast } from "@/components/ProMessage";
import { savePrompt } from "@/db/promptAction";
import logger from "@/lib/logger/Logger";
import React, { useMemo, useRef, useState } from "react";
type MidjourneyRes = {
  isFeedJob: true;
  id: "b08e8a31-a42a-49f8-b661-4d643ef3ca65";
  job_type: "v7_upscaler_2x_creative";
  event_type: "diffusion_upsample_v7_2x_creative";
  enqueue_time: 1769568430861;
  parent_grid: 3;
  parent_id: "c22eaf0d-0149-4c09-b90f-5dcc4e5a73ce";
  width: 1632;
  height: 2912;
  username_v2: "raphaelph_oo";
  display_name: "raphaelph_oo";
  user_id: "f7571256-4bb8-436f-9664-fca27207cc03";
  prompt: {
    no: [];
    images: [];
    stop: null;
    chaos: null;
    ar: {
      w: 9;
      h: 16;
    };
    seed: null;
    speed: null;
    visibility: null;
    batchSize: null;
    exp: 50;
    decodedPrompt: [
      {
        content: string;
        weight: 1;
      },
    ];
    params: null;
    version: "7";
    quality: null;
    tile: false;
    styleRaw: true;
    styleRef: [
      {
        t: "seed";
        content: "7900746702";
        weight: 1;
      },
      {
        t: "seed";
        content: "6251262609";
        weight: 1;
      },
      {
        t: "seed";
        content: "5806923518";
        weight: 1;
      },
      {
        t: "seed";
        content: "6613915458";
        weight: 1;
      },
      {
        t: "seed";
        content: "6682935143";
        weight: 1;
      },
      {
        t: "seed";
        content: "6552691773";
        weight: 1;
      },
      {
        t: "seed";
        content: "7056251134";
        weight: 1;
      },
      {
        t: "seed";
        content: "5239482753";
        weight: 1;
      },
    ];
    personalize: false;
    pv: null;
    sv: null;
    sw: null;
    omniRef: [];
    ow: null;
    depthRef: [];
    dw: null;
    stylize: 60;
    weird: 3;
    imageWeight: null;
    zoom: null;
    video: false;
    draft: false;
  };
  published: true;
  items: [
    {
      filtered: false;
      liked_by_user: false;
      actions: "{}";
      server_filtered: false;
    },
  ];
  owner_profile: null;
  type: "image";
  video_segments: null;
};

export type PromptObj = {
  id: string;
  content: string;
  imgUrl: string;
  mark: string;
};

function Formatter() {
  const [value, setValue] = useState("");
  const [mark, setMark] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  const promptList = useMemo(() => {
    try {
      const jsonObj: MidjourneyRes[] = JSON.parse(value);
      const promptList: PromptObj[] = jsonObj
        .filter((item) => item.prompt.decodedPrompt[0].content.length > 150)
        .map((item) => ({
          content: item.prompt.decodedPrompt[0].content,
          id: item.id,
          imgUrl: `https://cdn.midjourney.com/3969229a-2407-4a45-a969-3a6a1df9c0af/0_0.png`,
          mark: mark,
        }));
      return promptList;
    } catch (error) {
      logger.error("不是有效的 JSON 文件", error);
    }
  }, [value, mark]);

  const handleSave = async () => {
    try {
      if (!promptList) {
        toast.error("prompt list 为空");
        return;
      }
      if (!mark) {
        toast.error("必须指定类别标记");
        return;
      }
      await savePrompt(promptList, "midjourney");
      toast.success("保存成功");
    } catch (error) {
      toast.error("保存失败," + error);
    }
  };

  return (
    <Content>
      <textarea
        className="w-full h-100"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        ref={textRef}
      />
      <div>
        <div className="flex gap-3">
          <NeuInput
            value={mark}
            onChange={(e) => setMark(e.target.value)}
          ></NeuInput>
          <NeuButton onClick={handleSave}>保存</NeuButton>
          <NeuButton
            onClick={() => {
              setValue("");
              textRef.current?.focus();
            }}
          >
            清空
          </NeuButton>
        </div>
        <div>列表</div>
        {promptList?.map((item) => {
          return (
            <div key={item.id}>
              <div>id: {item.id}</div>
              <div>prompt:{item.content}</div>
            </div>
          );
        })}
      </div>
    </Content>
  );
}

export default Formatter;

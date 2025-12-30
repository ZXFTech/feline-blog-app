import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import NeuButton from "../NeuButton/neuButton";
import NeuDiv from "../NeuDiv/NeuDiv";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TodoSearchParams } from "@/types/todo";
import NeuInput from "../NeuInput";
import { debounce } from "@/utils/debounce ";

interface TodoOperationBarProps {
  refresh: () => void;
}

const TODO_STATUS_BUTTON_LIST = [
  {
    id: 0,
    label: "全部",
    status: "",
  },
  {
    id: 1,
    label: "未完成",
    status: "false",
  },
  {
    id: 2,
    label: "已完成",
    status: "true",
  },
];

export const TodoOperationBar = ({ refresh }: TodoOperationBarProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const params = new URLSearchParams(searchParams);
  const pOrderBy = params.get("orderBy") || "desc";
  const pTodoStatus = params.get("finished") || "";

  const updateSearchParams = useCallback(
    (key: keyof TodoSearchParams, value: string) => {
      const params = new URLSearchParams(searchParams);

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.replace(`${pathname}?${params}`);
    },
    [searchParams, router, pathname]
  );

  const debounceUpdate = useMemo(
    () =>
      debounce(
        (key: keyof TodoSearchParams, value: string) =>
          updateSearchParams(key, value),
        500
      ),
    [updateSearchParams]
  );

  const switchTodoStatus = (status: string) => {
    updateSearchParams("finished", status !== null ? status : "");
  };

  const switchOrderBy = () => {
    updateSearchParams("orderBy", pOrderBy === "asc" ? "desc" : "asc");
  };

  return (
    <NeuDiv
      neuType="flat"
      className="flex flex-row flex-wrap items-center justify-between mb-2 sticky right-0 left-0 top-0 z-100"
    >
      <div className="flex flex-row gap-2">
        <NeuInput onChange={(e) => debounceUpdate("content", e.target.value)} />
        <NeuButton
          className="p-1!"
          onClick={switchOrderBy}
          icon={`${
            pOrderBy === "desc"
              ? "keyboard_double_arrow_up"
              : "keyboard_double_arrow_down"
          }`}
        >
          <span className="font-medium tracking-wider">
            {pOrderBy === "desc" ? "按时间正序" : "按时间倒序"}
          </span>
        </NeuButton>
      </div>
      <NeuDiv neuType="flat" className="flex flex-row-reverse flex-wrap ">
        {TODO_STATUS_BUTTON_LIST.map((item) => (
          <NeuButton
            buttonType={`${
              pTodoStatus === item.status ? "primary" : "default"
            }`}
            key={item.id}
            onClick={() => {
              switchTodoStatus(item.status);
            }}
          >
            <span className="font-medium tracking-wider">{item.label}</span>
          </NeuButton>
        ))}
      </NeuDiv>
    </NeuDiv>
  );
};

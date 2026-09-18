"use client";

import React, { Dispatch, SetStateAction, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { NeuSurface } from "@/components/ui/neu-surface";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TodoSearchParams } from "@/types/todo";
import { InputField } from "@/components/ui/input-field";
import { debounce } from "@/utils/rateLimiting";
import { PermissionAccess } from "../Auth/PermissionAccess";
import Icon from "../Icon";

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

export const TodoOperationBar = ({
  setPanelVisible,
}: {
  setPanelVisible: Dispatch<SetStateAction<boolean>>;
}) => {
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
      debounce((key: keyof TodoSearchParams, value: string) => updateSearchParams(key, value), 500),
    [updateSearchParams]
  );

  const switchTodoStatus = (status: string) => {
    updateSearchParams("finished", status !== null ? status : "");
  };

  const switchOrderBy = () => {
    updateSearchParams("orderBy", pOrderBy === "asc" ? "desc" : "asc");
  };

  return (
    <div className="flex flex-row flex-wrap items-center justify-between mb-2 sticky right-0 left-0 top-0 z-100 bg-background">
      <div className="flex flex-row gap-2">
        <InputField
          prefix={<Icon icon="search" />}
          clearable
          onChange={(e) => debounceUpdate("content", e.target.value)}
        />
        <Button
          className="p-1!"
          onClick={switchOrderBy}
          materialIcon={`${
            pOrderBy === "desc" ? "keyboard_double_arrow_up" : "keyboard_double_arrow_down"
          }`}
        >
          <span className="font-medium tracking-wider">
            {pOrderBy === "desc" ? "按时间正序" : "按时间倒序"}
          </span>
        </Button>
      </div>
      <NeuSurface elevation="flat" className="flex flex-row-reverse flex-wrap ">
        {TODO_STATUS_BUTTON_LIST.map((item) => (
          <Button
            variant={`${pTodoStatus === item.status ? "primary" : "default"}`}
            key={item.id}
            onClick={() => {
              switchTodoStatus(item.status);
            }}
          >
            <span className="font-medium tracking-wider">{item.label}</span>
          </Button>
        ))}
      </NeuSurface>
      <PermissionAccess>
        <NeuSurface elevation="flat">
          <Button onClick={() => setPanelVisible(true)}>新建</Button>
        </NeuSurface>
      </PermissionAccess>
    </div>
  );
};

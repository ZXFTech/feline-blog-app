"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useMemo } from "react";
import NeuButton from "../NeuButton";
import NeuDiv from "../NeuDiv";
import NeuInput from "../NeuInput";
import { debounce } from "@/utils/debounce ";
import { PermissionAccess } from "../Auth/PermissionAccess";

export const BlogOperationBar = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const orderBy = searchParams.get("orderBy") || "desc";

  const updateSearchParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams);

      if (params.get(key) === value) {
        return;
      }

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
        (key: string, value: string) => updateSearchParams(key, value),
        500
      ),
    [updateSearchParams]
  );

  const switchOrderBy = () => {
    updateSearchParams("orderBy", orderBy === "asc" ? "desc" : "asc");
  };

  return (
    <div className="flex flex-col gap-4 mb-4 sticky right-0 left-0 top-0 z-100">
      <NeuDiv
        neuType="flat"
        className="flex flex-row flex-wrap items-center justify-between"
      >
        <div className="flex flex-row gap-2">
          <NeuInput
            onChange={(e) => debounceUpdate("content", e.target.value)}
          />
          <NeuButton
            icon={`${
              orderBy === "desc"
                ? "keyboard_double_arrow_up"
                : "keyboard_double_arrow_down"
            }`}
            className="p-1!"
            onClick={switchOrderBy}
          >
            <span className="font-medium tracking-wider">
              {orderBy === "desc" ? "按时间正序" : "按时间倒序"}
            </span>
          </NeuButton>
          {/* <Link href="/blog/new" className="hover:no-underline!"> */}
          <PermissionAccess>
            <NeuButton icon="add_box" onClick={() => router.push("/blog/new")}>
              <span className="font-medium tracking-wider">新建</span>
            </NeuButton>
          </PermissionAccess>
          {/* </Link> */}
        </div>
      </NeuDiv>
    </div>
  );
};

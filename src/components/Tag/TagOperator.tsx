"use client";

import React, { useCallback, useMemo, useState } from "react";
import Icon from "../Icon";
import NeuDiv from "../NeuDiv";
import NeuInput from "../NeuInput";
import NeuButton from "../NeuButton";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { debounce } from "@/utils/debounce ";

function TagOperator() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pOrderBy = searchParams.get("orderBy") || "desc";
  const pShow = searchParams.get("show") || "count";

  const updateSearchParams = useCallback(
    (key: string, value: string) => {
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
        (key: string, value: string) => updateSearchParams(key, value),
        500
      ),
    [updateSearchParams]
  );

  return (
    <div className="mb-2 flex flex-wrap justify-between items-center sticky top-0">
      <NeuInput
        prefix={<Icon icon="search" />}
        allowClear
        onChange={(e) => debounceUpdate("content", e.target.value)}
      />
      <NeuDiv neuType="flat" className="flex items-center justify-center">
        <span>展示：</span>
        <NeuButton
          buttonType={`${pShow === "blogs" ? "primary" : "default"}`}
          onClick={() => updateSearchParams("show", "blogs")}
        >
          blog
        </NeuButton>
        <NeuButton
          buttonType={`${pShow !== "blogs" ? "primary" : "default"}`}
          onClick={() => updateSearchParams("show", "todos")}
        >
          todo
        </NeuButton>
        <NeuButton
          onClick={() =>
            updateSearchParams("orderBy", pOrderBy === "asc" ? "desc" : "asc")
          }
        >
          {pOrderBy === "asc" ? "降序" : "升序"}
        </NeuButton>
      </NeuDiv>
    </div>
  );
}

export default TagOperator;

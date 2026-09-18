"use client";

import React, { useCallback, useMemo } from "react";
import Icon from "../Icon";
import { NeuSurface } from "@/components/ui/neu-surface";
import { InputField } from "@/components/ui/input-field";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { debounce } from "@/utils/rateLimiting";

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
    () => debounce((key: string, value: string) => updateSearchParams(key, value), 500),
    [updateSearchParams]
  );

  return (
    <div className="mb-2 flex flex-wrap justify-between items-center sticky top-0">
      <InputField
        prefix={<Icon icon="search" />}
        clearable
        onChange={(e) => debounceUpdate("content", e.target.value)}
      />
      <NeuSurface elevation="flat" className="flex items-center justify-center">
        <span>展示：</span>
        <Button
          variant={`${pShow === "blogs" ? "primary" : "default"}`}
          onClick={() => updateSearchParams("show", "blogs")}
        >
          blog
        </Button>
        <Button
          variant={`${pShow !== "blogs" ? "primary" : "default"}`}
          onClick={() => updateSearchParams("show", "todos")}
        >
          todo
        </Button>
        <Button onClick={() => updateSearchParams("orderBy", pOrderBy === "asc" ? "desc" : "asc")}>
          {pOrderBy === "asc" ? "降序" : "升序"}
        </Button>
      </NeuSurface>
    </div>
  );
}

export default TagOperator;

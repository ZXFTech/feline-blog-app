"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

export function ChecklistListFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(searchQuery);
  const expiry = searchParams.get("expiry") === "expired" ? "expired" : "active";
  const confirmation = searchParams.get("confirmation") ?? "all";

  const replace = (updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (
        !value ||
        (key === "confirmation" && value === "all") ||
        (key === "expiry" && value === "active")
      )
        next.delete(key);
      else next.set(key, value);
    }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
  };

  useEffect(() => {
    setQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    if (query.trim().normalize("NFC") === searchQuery) return;
    const timer = setTimeout(() => replace({ q: query.trim().normalize("NFC") }), 300);
    return () => clearTimeout(timer);
    // URL state is intentionally replaced only after the local query settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchQuery]);

  return (
    <div className="flex flex-col gap-3" aria-label="清单筛选">
      <label className="relative block">
        <span className="sr-only">搜索清单</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          value={query}
          maxLength={100}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索清单或项目"
          className="min-h-11 w-full rounded-lg bg-background py-2 pr-3 pl-10 text-sm shadow-neu-inset-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        />
      </label>
      <ButtonGroup aria-label="截止状态">
        <Button
          size="sm"
          variant={expiry === "active" ? "primary" : "default"}
          onClick={() => replace({ expiry: "active" })}
        >
          未过期
        </Button>
        <Button
          size="sm"
          variant={expiry === "expired" ? "primary" : "default"}
          onClick={() => replace({ expiry: "expired" })}
        >
          已过期
        </Button>
      </ButtonGroup>
      <ButtonGroup aria-label="确认状态">
        {[
          ["all", "全部"],
          ["confirmed", "全部确认"],
          ["partial", "部分未确认"],
          ["unconfirmed", "全部未确认"],
        ].map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={confirmation === value ? "primary" : "default"}
            onClick={() => replace({ confirmation: value })}
          >
            {label}
          </Button>
        ))}
      </ButtonGroup>
    </div>
  );
}

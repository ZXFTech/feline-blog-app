"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DemoErrorBoundary } from "@/app/album/_components/DemoErrorBoundary";
import {
  catalogCategories,
  catalogEntries,
  getCatalogEntry,
  searchCatalog,
  sortCatalogEntries,
  type CatalogEntry,
  type DemoProps,
} from "@/app/album/_components/catalog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NeuPanel } from "@/components/ui/neu-panel";
import { cn } from "@/lib/utils";

const DEFAULT_COMPONENT = "button";
const themeClasses = { light: "light", dark: "dark", sugar: "sugar", warm: "warm" } as const;

function DemoLoading() {
  return (
    <NeuPanel
      aria-live="polite"
      className="min-h-36 animate-pulse motion-reduce:animate-none"
      elevation="inset"
    >
      <span className="text-sm text-muted-foreground">正在加载演示模块…</span>
    </NeuPanel>
  );
}

type DemoLoadState =
  | { key: string; status: "loading" }
  | { key: string; status: "ready"; Demo: ComponentType<DemoProps> }
  | { key: string; status: "error" };

function useDemoLoader(entry: CatalogEntry, attempt: number): DemoLoadState | null {
  const loadKey = `${entry.slug}:${attempt}`;
  const [state, setState] = useState<DemoLoadState | null>(null);

  useEffect(() => {
    if (entry.status !== "ready") return;

    let active = true;
    entry.loadDemo().then(
      (module) => {
        if (active) setState({ key: loadKey, status: "ready", Demo: module.default });
      },
      (error: unknown) => {
        if (!active) return;
        console.error("Album demo failed to load", {
          componentSlug: entry.slug,
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        setState({ key: loadKey, status: "error" });
      }
    );

    return () => {
      active = false;
    };
  }, [entry, loadKey]);

  if (entry.status !== "ready") return null;
  return state?.key === loadKey ? state : { key: loadKey, status: "loading" };
}

function DemoLoadFailure({
  componentName,
  onRetry,
}: {
  componentName: string;
  onRetry: () => void;
}) {
  return (
    <NeuPanel className="items-start" elevation="inset" role="alert">
      <h3 className="font-semibold text-destructive">演示加载失败</h3>
      <p className="text-sm text-muted-foreground">
        {componentName} 暂时无法加载。目录仍可使用，你可以开始一次新的加载尝试。
      </p>
      <Button className="min-h-11 min-w-11" variant="primary" onClick={onRetry}>
        重新加载
      </Button>
    </NeuPanel>
  );
}

function CatalogNavigation({
  entries,
  query,
  selectedSlug,
  idPrefix,
  onQueryChange,
  onSelect,
}: {
  entries: readonly CatalogEntry[];
  query: string;
  selectedSlug: string;
  idPrefix: string;
  onQueryChange: (value: string) => void;
  onSelect: (entry: CatalogEntry) => void;
}) {
  const results = searchCatalog(query, entries);

  return (
    <div className="space-y-5 p-1">
      <InputGroup size="lg">
        <InputGroupAddon>
          <Search aria-hidden="true" className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="搜索组件"
          placeholder="搜索名称、分类或路径"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </InputGroup>
      {results.length ? (
        catalogCategories.map((category) => {
          const entries = sortCatalogEntries(
            results.filter((entry) => entry.categoryId === category.id)
          );
          if (!entries.length) return null;
          return (
            <section
              key={category.id}
              aria-labelledby={`${idPrefix}-${category.id}`}
              className="space-y-2"
            >
              <h2
                id={`${idPrefix}-${category.id}`}
                className="px-2 text-xs font-bold tracking-wide text-muted-foreground"
              >
                {category.label}
              </h2>
              <ul className="space-y-1">
                {entries.map((entry) => {
                  const selected = entry.slug === selectedSlug;
                  return (
                    <li key={entry.slug}>
                      <button
                        type="button"
                        aria-current={selected ? "page" : undefined}
                        className={cn(
                          "flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none transition-shadow motion-reduce:transition-none hover:shadow-neu-inset-sm focus-visible:ring-2 focus-visible:ring-primary/50",
                          selected && "bg-background font-semibold shadow-neu-inset-sm"
                        )}
                        onClick={() => onSelect(entry)}
                      >
                        <span className="min-w-0">
                          <span>{entry.nameZh}</span>
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {entry.codeName}
                          </span>
                        </span>
                        {entry.status === "pending" ? (
                          <span
                            className="size-2 shrink-0 rounded-full bg-status-warning"
                            title="待接入"
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      ) : (
        <NeuPanel elevation="inset">
          <p className="text-sm text-muted-foreground">
            没有匹配的组件。试试“按钮”“表单”或“card”。
          </p>
        </NeuPanel>
      )}
    </div>
  );
}

export function AlbumShowcase({ entries = catalogEntries }: { entries?: readonly CatalogEntry[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedSlug = searchParams.get("component");
  const requestedEntry = getCatalogEntry(requestedSlug, entries);
  const selectedEntry = requestedEntry ?? getCatalogEntry(DEFAULT_COMPONENT, entries) ?? entries[0];
  const [query, setQuery] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [sampleKey, setSampleKey] = useState(0);
  const demoState = useDemoLoader(selectedEntry, retryKey);
  const Demo = demoState?.status === "ready" ? demoState.Demo : null;
  const currentScenario =
    selectedEntry.status === "ready"
      ? selectedEntry.scenarios.find((scenario) => scenario.dimension === "default")
      : undefined;
  const themeScenario =
    selectedEntry.status === "ready"
      ? selectedEntry.scenarios.find(
          (scenario) => scenario.scenarioId === selectedEntry.capabilities.themeComparison[0]
        )
      : undefined;

  const selectEntry = useCallback(
    (entry: CatalogEntry) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("component", entry.slug);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const retry = () => setRetryKey((value) => value + 1);
  const resetKey = `${selectedEntry.slug}-${retryKey}-${sampleKey}`;

  return (
    <main
      id="main-content"
      className="album-showcase mx-auto min-h-screen w-full max-w-[96rem] px-4 pb-16 pt-24 sm:px-6"
    >
      <header className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">组件展示</h1>
          <Badge variant="primary">{entries.length} 个家族</Badge>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
          浏览项目真实组件的默认形态、尺寸、状态与四套主题；待接入条目会明确说明依赖边界。
        </p>
      </header>

      <details className="mb-5 lg:hidden">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between rounded-lg bg-background px-4 py-3 font-semibold shadow-neu-raised-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
          选择组件{" "}
          <span className="text-sm font-normal text-muted-foreground">{selectedEntry.nameZh}</span>
        </summary>
        <NeuPanel className="mt-3 max-h-[60vh] overflow-y-auto" elevation="inset">
          <CatalogNavigation
            entries={entries}
            idPrefix="mobile-catalog"
            query={query}
            selectedSlug={selectedEntry.slug}
            onQueryChange={setQuery}
            onSelect={selectEntry}
          />
        </NeuPanel>
      </details>

      <div className="grid items-start gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside
          aria-label="组件目录"
          className="sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 lg:block"
        >
          <CatalogNavigation
            entries={entries}
            idPrefix="desktop-catalog"
            query={query}
            selectedSlug={selectedEntry.slug}
            onQueryChange={setQuery}
            onSelect={selectEntry}
          />
        </aside>

        <article className="min-w-0 space-y-8">
          {!requestedEntry && requestedSlug ? (
            <NeuPanel
              role="status"
              className="border border-status-warning/30 text-sm"
              elevation="inset"
            >
              未找到 “{requestedSlug}”，已展示默认的 Button。URL 保持不变，便于排查无效链接。
            </NeuPanel>
          ) : null}
          <section className="space-y-4" aria-labelledby="component-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="component-title" className="text-2xl font-bold">
                    {selectedEntry.nameZh}
                  </h2>
                  <code className="rounded-md bg-muted px-2 py-1 text-sm">
                    {selectedEntry.codeName}
                  </code>
                  <Badge variant={selectedEntry.status === "ready" ? "success" : "warning"}>
                    {selectedEntry.status === "ready" ? "可演示" : "待接入"}
                  </Badge>
                </div>
                <p className="max-w-3xl leading-7 text-muted-foreground">
                  {selectedEntry.description}
                </p>
              </div>
              {selectedEntry.status === "ready" ? (
                <Button
                  className="min-h-11 min-w-11"
                  materialIcon="restart_alt"
                  onClick={() => setSampleKey((value) => value + 1)}
                >
                  重置样例
                </Button>
              ) : null}
            </div>
            <NeuPanel className="grid gap-4 text-sm sm:grid-cols-2" elevation="inset">
              <div>
                <h3 className="mb-1 font-semibold">适用场景</h3>
                <p className="text-muted-foreground">{selectedEntry.useCases.join(" · ")}</p>
              </div>
              <div>
                <h3 className="mb-1 font-semibold">导入路径</h3>
                <code className="break-all text-xs text-muted-foreground">
                  {selectedEntry.importPath}
                </code>
              </div>
              <div>
                <h3 className="mb-1 font-semibold">尺寸</h3>
                <p className="text-muted-foreground">
                  {selectedEntry.capabilities.sizes.join(" · ")}
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-semibold">状态 / 变体</h3>
                <p className="text-muted-foreground">
                  {[
                    ...selectedEntry.capabilities.states,
                    ...selectedEntry.capabilities.variants,
                  ].join(" · ")}
                </p>
              </div>
            </NeuPanel>
          </section>

          {selectedEntry.status === "pending" ? (
            <NeuPanel className="gap-4" elevation="inset">
              <div>
                <h3 className="font-semibold">为什么暂不可演示</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {selectedEntry.pendingReason}
                </p>
              </div>
              <div>
                <h3 className="font-semibold">接入条件</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {selectedEntry.integrationNeeds}
                </p>
              </div>
            </NeuPanel>
          ) : demoState?.status === "loading" ? (
            <DemoLoading />
          ) : demoState?.status === "error" ? (
            <DemoLoadFailure componentName={selectedEntry.nameZh} onRetry={retry} />
          ) : Demo && currentScenario ? (
            <DemoErrorBoundary
              componentName={selectedEntry.nameZh}
              componentSlug={selectedEntry.slug}
              resetKey={resetKey}
              onRetry={retry}
            >
              <Demo
                key={`${resetKey}-${currentScenario.scenarioId}`}
                {...currentScenario.render}
                instanceId="current"
              />
            </DemoErrorBoundary>
          ) : null}

          {Demo && themeScenario ? (
            <section className="space-y-3" aria-labelledby="theme-comparison-title">
              <div>
                <h3 id="theme-comparison-title" className="text-lg font-semibold">
                  四主题代表形态
                </h3>
                <p className="text-sm text-muted-foreground">
                  每格使用同一个真实组件场景；浮层类组件仅在当前全局主题打开。
                </p>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {(Object.entries(themeClasses) as Array<[keyof typeof themeClasses, string]>).map(
                  ([theme, themeClass]) => (
                    <div
                      key={theme}
                      data-album-theme={theme}
                      className={cn(
                        themeClass,
                        "rounded-xl bg-background p-4 text-foreground shadow-neu-inset"
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-semibold capitalize">{theme}</span>
                        <Badge>{theme}</Badge>
                      </div>
                      <DemoErrorBoundary
                        componentName={selectedEntry.nameZh}
                        componentSlug={selectedEntry.slug}
                        resetKey={`${resetKey}-${theme}`}
                        onRetry={retry}
                      >
                        <Demo
                          key={`${resetKey}-${theme}-${themeScenario.scenarioId}`}
                          {...themeScenario.render}
                          instanceId={theme}
                        />
                      </DemoErrorBoundary>
                    </div>
                  )
                )}
              </div>
            </section>
          ) : null}
        </article>
      </div>
    </main>
  );
}

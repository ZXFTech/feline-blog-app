"use client";

import { useState } from "react";

import type { DemoProps } from "@/app/album/_components/catalog";
import { DemoSection } from "@/app/album/_components/demos/DemoSection";
import Content from "@/components/Content";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { NeuPanel } from "@/components/ui/neu-panel";
import { cn } from "@/lib/utils";

type ShellMode = "main" | "actions" | "complete";

const modeLabels: ReadonlyArray<{ mode: ShellMode; label: string }> = [
  { mode: "main", label: "仅主区" },
  { mode: "actions", label: "主区与操作区" },
  { mode: "complete", label: "完整三区" },
];

function Region({ title, detail }: { title: string; detail: string }) {
  return (
    <NeuPanel density="compact" elevation="raised-sm">
      <strong className="text-sm">{title}</strong>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </NeuPanel>
  );
}

function ShellViewport({ mode, compact = false }: { mode: ShellMode; compact?: boolean }) {
  const showRight = mode !== "main";
  const showLeft = mode === "complete";

  return (
    <figure className="min-w-0 flex-1">
      <div
        data-testid={compact ? "compact-shell-viewport" : "shell-viewport"}
        className={cn(
          "relative isolate w-full transform-gpu overflow-hidden rounded-xl bg-background shadow-neu-inset",
          compact ? "h-44" : "h-[28rem]",
          "[&_.content]:!h-auto [&_.content]:!min-h-0 [&_.content]:!overflow-visible",
          "[&_.left-side-bar]:!h-auto [&_.left-side-bar]:!min-h-0 [&_.left-side-bar]:!overflow-visible",
          "[&_.right-side-bar]:!h-auto [&_.right-side-bar]:!min-h-0 [&_.right-side-bar]:!overflow-visible",
          "[&_.left-side-bar]:!px-3 [&_.left-side-bar]:!pb-12 [&_.left-side-bar]:!pt-2",
          "[&_.right-side-bar]:!px-3 [&_.right-side-bar]:!pb-12 [&_.right-side-bar]:!pt-2"
        )}
      >
        <div inert aria-hidden="true" className="pointer-events-none select-none">
          <Navbar routeList={["home", "album"]} />
          {compact ? (
            <main className="px-4 pb-12 pt-20">
              <Region title="页面主区" detail="全局导航与固定页脚" />
            </main>
          ) : (
            <Content
              className="!h-auto !min-h-0 !overflow-visible !px-3 !pb-12 !pt-20"
              leftSideBar={
                showLeft ? <Region title="页面信息" detail="展示类辅助内容" /> : undefined
              }
              rightSideBar={
                showRight ? <Region title="页面操作" detail="当前页面的操作入口" /> : undefined
              }
            >
              <Region title="页面主区" detail="页面的主要阅读与工作内容" />
            </Content>
          )}
          <Footer />
        </div>
      </div>
      <figcaption className="mt-2 text-xs leading-5 text-muted-foreground">
        真实 Navbar、Content 与 Footer 被限制在演示视口内，不会覆盖当前 Album 页面。
      </figcaption>
    </figure>
  );
}

export default function ShellDemo({ compact = false }: DemoProps) {
  const [mode, setMode] = useState<ShellMode>("complete");

  if (compact) return <ShellViewport compact mode="main" />;

  return (
    <div className="space-y-6">
      <DemoSection title="页面区域组合">
        <div className="w-full space-y-4">
          <ButtonGroup aria-label="页面区域组合">
            {modeLabels.map((item) => (
              <Button
                key={item.mode}
                aria-pressed={mode === item.mode}
                variant={mode === item.mode ? "primary" : "default"}
                onClick={() => setMode(item.mode)}
              >
                {item.label}
              </Button>
            ))}
          </ButtonGroup>
          <ShellViewport mode={mode} />
        </div>
      </DemoSection>
    </div>
  );
}

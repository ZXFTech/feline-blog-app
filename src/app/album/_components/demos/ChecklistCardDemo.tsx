"use client";

import { useState } from "react";

import type { DemoProps } from "@/app/album/_components/catalog";
import { ComponentDemoGroup, DemoSection } from "@/app/album/_components/demos/DemoSection";
import { checklistFixtures } from "@/app/album/_components/fixtures/checklist";
import { ChecklistCard, type ChecklistCardSize } from "@/components/Checklist/ChecklistCard";
import { Button } from "@/components/ui/button";
import { NeuPanel } from "@/components/ui/neu-panel";
import type { Checklist } from "@/lib/checklist";

const sizes = ["sm", "md", "lg"] as const satisfies readonly ChecklistCardSize[];

const stateScenarios = [
  { label: "未完成", checklist: checklistFixtures.unconfirmed },
  { label: "部分完成", checklist: checklistFixtures.partial },
  { label: "全部完成", checklist: checklistFixtures.confirmed },
  { label: "已过期", checklist: checklistFixtures.expired },
] as const;

export default function ChecklistCardDemo({ compact = false }: DemoProps) {
  const [visible, setVisible] = useState(true);
  const [message, setMessage] = useState("尚未操作样例");

  const report = (action: string, checklist: Checklist) => {
    setMessage(`${action}：${checklist.name}`);
  };

  const reset = () => {
    setVisible(true);
    setMessage("已恢复默认样例");
  };

  if (compact) {
    return (
      <div className="flex justify-center overflow-x-auto p-1">
        <ChecklistCard checklist={checklistFixtures.partial} size="sm" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <ComponentDemoGroup
        title="清单卡片 ChecklistCard"
        description="用于概览清单名称、截止时间和完成进度，并提供查看详情、编辑与删除入口。"
      >
        <DemoSection nested title="尺寸">
          {sizes.map((size) => (
            <div key={size} className="space-y-2">
              <p className="text-center text-xs font-semibold text-muted-foreground">{size}</p>
              <ChecklistCard
                checklist={checklistFixtures.partial}
                size={size}
                onOpenDetail={(checklist) => report("查看详情", checklist)}
                onEdit={(checklist) => report("编辑", checklist)}
                onDelete={(checklist) => report("删除", checklist)}
              />
            </div>
          ))}
        </DemoSection>

        <DemoSection nested title="完成状态与有效期">
          {stateScenarios.map((scenario) => (
            <div key={scenario.checklist.id} className="space-y-2">
              <p className="text-center text-xs font-semibold text-muted-foreground">
                {scenario.label}
              </p>
              <ChecklistCard
                checklist={scenario.checklist}
                size="md"
                onOpenDetail={(checklist) => report("查看详情", checklist)}
                onEdit={(checklist) => report("编辑", checklist)}
                onDelete={(checklist) => report("删除", checklist)}
              />
            </div>
          ))}
        </DemoSection>

        <DemoSection nested title="本地交互沙箱">
          <div
            data-testid="checklist-card-sandbox"
            className="flex min-w-0 flex-1 flex-col items-start gap-4 sm:flex-row sm:items-center"
          >
            {visible ? (
              <ChecklistCard
                checklist={checklistFixtures.partial}
                size="md"
                onOpenDetail={(checklist) => report("查看详情", checklist)}
                onEdit={(checklist) => report("编辑", checklist)}
                onDelete={(checklist) => {
                  setVisible(false);
                  report("已从本地沙箱删除", checklist);
                }}
              />
            ) : (
              <NeuPanel className="min-h-44 min-w-48 justify-center" elevation="flat">
                <p className="text-sm font-medium">清单卡片已从本地沙箱移除</p>
                <p className="text-sm text-muted-foreground">真实数据没有发生变化。</p>
              </NeuPanel>
            )}
            <div className="space-y-3">
              <p aria-live="polite" className="text-sm text-muted-foreground">
                {message}
              </p>
              <Button className="min-h-11" materialIcon="restart_alt" onClick={reset}>
                恢复默认样例
              </Button>
            </div>
          </div>
        </DemoSection>
      </ComponentDemoGroup>
    </div>
  );
}

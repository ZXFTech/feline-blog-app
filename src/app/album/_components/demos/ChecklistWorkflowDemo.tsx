"use client";

import { useState } from "react";

import type { DemoProps } from "@/app/album/_components/catalog";
import { ComponentDemoGroup, DemoSection } from "@/app/album/_components/demos/DemoSection";
import {
  checklistFixtures,
  checklistFormFixtures,
} from "@/app/album/_components/fixtures/checklist";
import { ChecklistDetailDialog } from "@/components/Checklist/ChecklistDetailDialog";
import { ChecklistForm, type ChecklistFormValues } from "@/components/Checklist/ChecklistForm";
import { ChecklistItemCard } from "@/components/Checklist/ChecklistItemCard";
import { ChecklistItemDetailDialog } from "@/components/Checklist/ChecklistItemDetailDialog";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { NeuPanel } from "@/components/ui/neu-panel";
import type { Checklist, ChecklistItem } from "@/lib/checklist";

type FormMode = "create" | "edit";

const itemSizes = ["sm", "md", "lg"] as const;

function cloneChecklist(checklist: Checklist): Checklist {
  return { ...checklist, items: checklist.items.map((item) => ({ ...item })) };
}

export default function ChecklistWorkflowDemo({ compact = false }: DemoProps) {
  const [sandboxItem, setSandboxItem] = useState<ChecklistItem>({
    ...checklistFixtures.partial.items[1],
  });
  const [itemVisible, setItemVisible] = useState(true);
  const [itemMessage, setItemMessage] = useState("尚未操作样例");
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [formRevision, setFormRevision] = useState(0);
  const [formMessage, setFormMessage] = useState("表单尚未提交");
  const [failNextSubmit, setFailNextSubmit] = useState(false);
  const [dialogChecklist, setDialogChecklist] = useState<Checklist>(() =>
    cloneChecklist(checklistFixtures.partial)
  );
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ChecklistItem>(
    checklistFixtures.partial.items[0]
  );
  const [itemDialogOpen, setItemDialogOpen] = useState(false);

  if (compact) {
    return (
      <div className="flex justify-center overflow-x-auto p-1">
        <ChecklistItemCard item={checklistFixtures.partial.items[1]} size="sm" />
      </div>
    );
  }

  const resetItemSandbox = () => {
    setSandboxItem({ ...checklistFixtures.partial.items[1] });
    setItemVisible(true);
    setItemMessage("已恢复默认清单项");
  };

  const resetForm = () => {
    setFormRevision((value) => value + 1);
    setFailNextSubmit(false);
    setFormMessage("已恢复当前模式的默认表单");
  };

  const switchFormMode = (mode: FormMode) => {
    setFormMode(mode);
    setFormRevision((value) => value + 1);
    setFailNextSubmit(false);
    setFormMessage(mode === "create" ? "已切换为创建模式" : "已切换为编辑模式");
  };

  const submitForm = async (values: ChecklistFormValues) => {
    if (failNextSubmit) {
      setFailNextSubmit(false);
      throw new Error("模拟保存失败，请检查后重试");
    }
    setFormMessage(`已在本地保存：${values.name}，共 ${values.items.length} 项`);
  };

  const openItemDetail = (item: ChecklistItem) => {
    setSelectedItem(item);
    setChecklistDialogOpen(false);
    setItemDialogOpen(true);
  };

  const toggleDialogItem = (item: ChecklistItem) => {
    setDialogChecklist((current) => ({
      ...current,
      items: current.items.map((candidate) =>
        candidate.id === item.id ? { ...candidate, done: !candidate.done } : candidate
      ),
    }));
  };

  return (
    <div className="space-y-10">
      <ComponentDemoGroup
        title="1. 清单项卡片 ChecklistItemCard"
        description="展示单个清单项的确认状态、说明和快捷操作；点击卡片切换状态，长按或信息按钮查看详情。"
      >
        <DemoSection nested title="尺寸与状态">
          {itemSizes.map((size, index) => (
            <div key={size} className="space-y-2">
              <p className="text-center text-xs font-semibold text-muted-foreground">{size}</p>
              <ChecklistItemCard
                item={
                  index === 1
                    ? checklistFixtures.partial.items[0]
                    : checklistFixtures.partial.items[1]
                }
                size={size}
              />
            </div>
          ))}
        </DemoSection>

        <DemoSection nested title="本地交互沙盒">
          <div
            data-testid="checklist-item-sandbox"
            className="flex min-w-0 flex-1 flex-col items-start gap-4 sm:flex-row sm:items-center"
          >
            {itemVisible ? (
              <ChecklistItemCard
                item={sandboxItem}
                size="md"
                onToggle={(item) => {
                  setSandboxItem((current) => ({ ...current, done: !current.done }));
                  setItemMessage(item.done ? "已标记为未确认" : "已标记为已确认");
                }}
                onOpenDetail={openItemDetail}
                onEdit={(item) => setItemMessage(`模拟编辑：${item.label}`)}
                onDelete={(item) => {
                  setItemVisible(false);
                  setItemMessage(`已从本地沙盒删除：${item.label}`);
                }}
              />
            ) : (
              <NeuPanel className="min-h-44 min-w-48 justify-center" elevation="flat">
                <p className="text-sm font-medium">清单项已从本地沙盒移除</p>
                <p className="text-sm text-muted-foreground">真实数据没有发生变化。</p>
              </NeuPanel>
            )}
            <div className="space-y-3">
              <p aria-live="polite" className="text-sm text-muted-foreground">
                {itemMessage}
              </p>
              <Button
                aria-label="恢复清单项"
                className="min-h-11"
                materialIcon="restart_alt"
                type="button"
                onClick={resetItemSandbox}
              >
                恢复清单项
              </Button>
            </div>
          </div>
        </DemoSection>
      </ComponentDemoGroup>

      <ComponentDemoGroup
        title="2. 清单表单 ChecklistForm"
        description="同一生产表单覆盖创建与编辑模式、动态清单项、有效期、字段校验和提交失败反馈。"
      >
        <DemoSection nested title="创建、编辑与错误状态">
          <div data-testid="checklist-form-sandbox" className="w-full space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ButtonGroup aria-label="选择清单表单模式">
                <Button
                  aria-pressed={formMode === "create"}
                  type="button"
                  variant={formMode === "create" ? "primary" : "default"}
                  onClick={() => switchFormMode("create")}
                >
                  创建模式
                </Button>
                <Button
                  aria-pressed={formMode === "edit"}
                  type="button"
                  variant={formMode === "edit" ? "primary" : "default"}
                  onClick={() => switchFormMode("edit")}
                >
                  编辑模式
                </Button>
              </ButtonGroup>
              <div className="flex flex-wrap gap-3">
                <Button
                  className="min-h-11"
                  type="button"
                  variant={failNextSubmit ? "warning" : "default"}
                  onClick={() => {
                    setFailNextSubmit(true);
                    setFormMessage("下一次提交将模拟失败");
                  }}
                >
                  下一次提交模拟失败
                </Button>
                <Button
                  aria-label="重置表单"
                  className="min-h-11"
                  materialIcon="restart_alt"
                  type="button"
                  onClick={resetForm}
                >
                  重置表单
                </Button>
              </div>
            </div>
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {formMessage}
            </p>
            <NeuPanel className="w-full" density="comfortable" elevation="flat">
              <ChecklistForm
                key={`${formMode}-${formRevision}`}
                mode={formMode}
                initialValues={checklistFormFixtures[formMode]}
                onSubmit={submitForm}
                onCancel={resetForm}
              />
            </NeuPanel>
          </div>
        </DemoSection>
      </ComponentDemoGroup>

      <ComponentDemoGroup
        title="3. 清单与清单项详情 ChecklistDetailDialog / ChecklistItemDetailDialog"
        description="使用真实 Dialog 契约展示清单级进度与清单项详情。弹窗只在当前全局主题中打开。"
      >
        <DemoSection nested title="当前主题交互触发器">
          <div data-testid="checklist-dialog-triggers" className="flex flex-wrap gap-3">
            <Button
              className="min-h-11"
              type="button"
              variant="primary"
              onClick={() => setChecklistDialogOpen(true)}
            >
              打开清单详情
            </Button>
            <Button
              className="min-h-11"
              type="button"
              onClick={() => openItemDetail(dialogChecklist.items[0])}
            >
              打开清单项详情
            </Button>
          </div>
        </DemoSection>
      </ComponentDemoGroup>

      <ChecklistDetailDialog
        open={checklistDialogOpen}
        checklist={dialogChecklist}
        onOpenChange={setChecklistDialogOpen}
        onItemDetail={openItemDetail}
        onToggleItem={toggleDialogItem}
      />
      <ChecklistItemDetailDialog
        open={itemDialogOpen}
        item={selectedItem}
        onOpenChange={setItemDialogOpen}
      />
    </div>
  );
}

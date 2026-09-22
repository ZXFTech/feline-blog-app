"use client";

import { useRouter } from "next/navigation";
import { toast } from "@/components/ProMessage";
import { ChecklistForm, type ChecklistFormValues } from "@/components/Checklist/ChecklistForm";
import {
  createChecklist,
  getChecklistForEdit,
  restoreChecklistItems,
  updateChecklist,
} from "@/db/checklistAction";
import type { ChecklistDetail } from "@/types/checklist";

interface ChecklistFormScreenProps {
  detail?: ChecklistDetail;
  createRequestId?: string;
}

function localDateTime(iso: string) {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ChecklistFormScreen({ detail, createRequestId }: ChecklistFormScreenProps) {
  const router = useRouter();
  const initialValues: ChecklistFormValues = detail
    ? {
        name: detail.name,
        themeColor: detail.themeColor,
        expiresAt: { kind: "datetime", localDateTime: localDateTime(detail.expiresAt) },
        items: detail.items.map((item) => ({
          kind: "existing",
          itemId: item.id,
          expectedRevision: item.revision,
          clientKey: item.id,
          detail: item.detail,
        })),
      }
    : {
        name: "",
        themeColor: "#20c997",
        expiresAt: { kind: "datetime", localDateTime: "" },
        items: [],
      };

  const submit = async (values: ChecklistFormValues) => {
    if (!values.items.length) throw new Error("清单至少需要一个项目");
    const common = {
      name: values.name,
      themeColor: values.themeColor,
      localDateTime: values.expiresAt.localDateTime,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      items: values.items.map((item) => ({
        ...(item.itemId ? { id: item.itemId } : {}),
        ...(item.expectedRevision ? { revision: item.expectedRevision } : {}),
        detail: item.detail,
      })),
    };
    if (detail) {
      let result: Awaited<ReturnType<typeof updateChecklist>>;
      try {
        result = await updateChecklist({ ...common, id: detail.id, revision: detail.revision });
      } catch {
        const authoritative = await getChecklistForEdit(detail.id);
        if (authoritative.status === "success") {
          const submittedItems = common.items.map((item) => item.detail.trim().normalize("NFC"));
          const storedItems = authoritative.data.items.map((item) => item.detail);
          if (
            authoritative.data.name === common.name.trim().normalize("NFC") &&
            authoritative.data.themeColor === common.themeColor &&
            localDateTime(authoritative.data.expiresAt) === common.localDateTime &&
            JSON.stringify(storedItems) === JSON.stringify(submittedItems)
          ) {
            toast.success("清单已更新");
            router.push(`/checklists/${detail.id}`);
            router.refresh();
            return;
          }
        }
        throw new Error("保存结果未知，已重新读取清单，请核对后重试");
      }
      if (!result || result.status !== "success") {
        throw new Error(result?.message ?? "更新失败");
      }
      if (result.data.deletedItems.length) {
        const deletion = result.data;
        toast.success(`已删除 ${deletion.deletedItems.length} 个项目`, {
          duration: Math.max(
            0,
            new Date(deletion.undoVisibleUntil!).getTime() - new Date(deletion.serverNow).getTime()
          ),
          action: {
            label: "撤销",
            onClick: async () => {
              try {
                const restored = await restoreChecklistItems({
                  checklistId: detail.id,
                  items: deletion.deletedItems.map((item) => ({
                    itemId: item.id,
                    itemRevision: item.revision,
                  })),
                  parentRevision: deletion.detail.revision,
                });
                if (restored.status === "success") router.refresh();
                else toast.error(restored.message);
              } catch {
                router.refresh();
                toast.error("恢复结果未知，正在重新读取清单");
              }
            },
          },
        });
      }
      toast.success("清单已更新");
      router.push(`/checklists/${detail.id}`);
      router.refresh();
      return;
    }
    if (!createRequestId) throw new Error("创建请求标识缺失，请刷新页面后重试");
    let result: Awaited<ReturnType<typeof createChecklist>>;
    try {
      result = await createChecklist({ ...common, createRequestId });
    } catch {
      result = await createChecklist({ ...common, createRequestId });
    }
    if (result.status !== "success") throw new Error(result.message);
    toast.success("清单已创建");
    router.replace(`/checklists/${result.data.id}`);
    router.refresh();
  };

  return (
    <ChecklistForm
      fillHeight
      mode={detail ? "edit" : "create"}
      initialValues={initialValues}
      onSubmit={submit}
      onCancel={() => router.back()}
      deadlineRequired
      requireItem
    />
  );
}

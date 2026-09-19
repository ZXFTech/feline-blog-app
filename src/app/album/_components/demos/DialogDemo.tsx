"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";

import type { DemoProps } from "@/app/album/_components/catalog";
import { ComponentDemoGroup, DemoSection } from "@/app/album/_components/demos/DemoSection";
import Modal from "@/components/Modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function DialogDemo({ compact = false }: DemoProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("尚未执行对话框操作");

  if (compact) {
    return (
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="primary">
          Dialog 触发器
        </Button>
        <Button type="button" variant="danger">
          AlertDialog 触发器
        </Button>
        <Button type="button">Modal 触发器</Button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {message}
      </p>

      <ComponentDemoGroup
        title="1. 通用对话框 Dialog"
        description="用于承载补充信息或短流程，支持遮罩、焦点管理、Escape 关闭和返回触发器。"
      >
        <DemoSection nested title="当前主题真实交互">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button type="button" variant="primary" />}>
              打开通用对话框
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogTitle className="text-lg font-semibold">组件展示说明</DialogTitle>
              <DialogDescription className="mt-2 text-sm text-muted-foreground">
                这是固定中文样例，不会读取或写入真实数据。
              </DialogDescription>
              <div className="mt-6 flex justify-end gap-3">
                <DialogClose render={<Button type="button" />}>关闭</DialogClose>
                <DialogClose
                  render={<Button type="button" variant="primary" />}
                  onClick={() => setMessage("已在本地确认通用对话框")}
                >
                  确认
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </DemoSection>
      </ComponentDemoGroup>

      <ComponentDemoGroup
        title="2. 确认对话框 AlertDialog"
        description="用于不可逆或高风险操作，明确说明影响，并要求用户选择取消或确认。"
      >
        <DemoSection nested title="default 与 sm 确认形态">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="danger">
                打开删除确认
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <CircleAlert aria-hidden="true" />
                </AlertDialogMedia>
                <AlertDialogTitle>移除本地样例？</AlertDialogTitle>
                <AlertDialogDescription>
                  只会更新 Album 当前页面的提示，不会删除任何真实数据。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  variant="danger"
                  onClick={() => setMessage("已确认本地删除样例")}
                >
                  确认移除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button">打开紧凑确认</Button>
            </AlertDialogTrigger>
            <AlertDialogContent size="sm">
              <AlertDialogHeader>
                <AlertDialogTitle>继续本地操作？</AlertDialogTitle>
                <AlertDialogDescription>该操作只演示紧凑确认形态。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>返回</AlertDialogCancel>
                <AlertDialogAction onClick={() => setMessage("已确认紧凑对话框")}>
                  继续
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DemoSection>
      </ComponentDemoGroup>

      <ComponentDemoGroup
        title="3. 受控弹窗 Modal"
        description="项目现有受控浮层，通过 visible、onClose 和 onOk 管理状态，并支持页脚、按钮类型和加载状态。"
      >
        <DemoSection nested title="默认页脚与本地结果">
          <Button type="button" onClick={() => setModalOpen(true)}>
            打开受控弹窗
          </Button>
          <Modal
            visible={modalOpen}
            title="本地发布检查"
            okText="确认本地操作"
            cancelText="取消"
            onClose={() => {
              setModalOpen(false);
              setMessage("已取消受控弹窗");
            }}
            onOk={() => {
              setModalOpen(false);
              setMessage("已确认受控弹窗");
            }}
          >
            <p className="text-sm leading-6 text-muted-foreground">
              此处仅展示现有 Modal 契约，不会触发发布或网络请求。
            </p>
          </Modal>
        </DemoSection>
      </ComponentDemoGroup>
    </div>
  );
}

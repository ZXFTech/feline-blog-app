import type { ReactNode } from "react";
import Link from "next/link";
import Content from "@/components/Content";
import { NeuPanel } from "@/components/ui/neu-panel";
export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Content>
      <main className="mx-auto max-w-xl p-[var(--spacing-panel-inset-default)]">
        <NeuPanel>
          <p>neon cat · 账号与安全</p>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {children}
          <Link href="/login">返回登录页</Link>
          <Link href="/profile">账号与安全</Link>
        </NeuPanel>
      </main>
    </Content>
  );
}

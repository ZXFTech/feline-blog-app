import type { ReactNode } from "react";
import Link from "next/link";
import Content from "@/components/Content";
import { NeuPanel } from "@/components/ui/neu-panel";
export default function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return <Content><main className="mx-auto max-w-xl p-[var(--spacing-panel-inset-default)]"><NeuPanel><p>neon cat · 账号与安全</p><h1 className="text-2xl font-semibold">{title}</h1>{children}<a className="inline-flex min-h-11 items-center" href="/login">返回登录页</a><Link className="inline-flex min-h-11 items-center" href="/">继续浏览公开文章</Link></NeuPanel></main></Content>;
}

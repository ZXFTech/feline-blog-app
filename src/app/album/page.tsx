import type { Metadata } from "next";
import { Suspense } from "react";

import { AlbumShowcase } from "@/app/album/_components/AlbumShowcase";
import { NeuPanel } from "@/components/ui/neu-panel";

export const metadata: Metadata = {
  title: "组件展示 · Album",
  description: "浏览 feline-blog-app 已有组件、状态、尺寸与主题表现。",
  robots: { index: false, follow: false },
};

function AlbumFallback() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[96rem] px-4 pb-16 pt-24 sm:px-6">
      <NeuPanel
        aria-live="polite"
        className="min-h-64 animate-pulse motion-reduce:animate-none"
        elevation="inset"
      >
        <span className="sr-only">正在加载组件展示中心</span>
      </NeuPanel>
    </main>
  );
}

export default function AlbumPage() {
  return (
    <Suspense fallback={<AlbumFallback />}>
      <AlbumShowcase />
    </Suspense>
  );
}

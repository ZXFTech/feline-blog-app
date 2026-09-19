import type { ReactNode } from "react";

import { NeuPanel } from "@/components/ui/neu-panel";

export function ComponentDemoGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5 border-t border-border/70 pt-6 first:border-t-0 first:pt-0">
      <header className="space-y-1.5">
        <h3 className="text-lg font-bold text-foreground">{title}</h3>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </header>
      {children}
    </section>
  );
}

export function DemoSection({
  title,
  children,
  nested = false,
}: {
  title: string;
  children: ReactNode;
  nested?: boolean;
}) {
  return (
    <section className="space-y-3">
      {nested ? (
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      ) : (
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      )}
      <NeuPanel
        className="min-w-0 flex-wrap items-center gap-3 overflow-x-auto"
        density="comfortable"
        elevation="inset"
        layout="row"
      >
        {children}
      </NeuPanel>
    </section>
  );
}

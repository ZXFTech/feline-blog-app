import type { ReactNode } from "react";
import { NeuPanel } from "@/components/ui/neu-panel";

interface BlogStatusPanelProps {
  title: string;
  description: string;
  children?: ReactNode;
  busy?: boolean;
  failure?: boolean;
}

export function BlogStatusPanel({
  title,
  description,
  children,
  busy = false,
  failure = false,
}: BlogStatusPanelProps) {
  return (
    <NeuPanel aria-busy={busy} className="min-w-0 [overflow-wrap:anywhere]">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p role={failure ? "alert" : busy ? "status" : undefined}>{description}</p>
      {children}
    </NeuPanel>
  );
}

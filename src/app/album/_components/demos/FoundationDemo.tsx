import type { DemoProps } from "@/app/album/_components/catalog";
import { DemoSection } from "@/app/album/_components/demos/DemoSection";
import { NeuPanel } from "@/components/ui/neu-panel";
import { NeuSurface } from "@/components/ui/neu-surface";

export default function FoundationDemo({ compact = false }: DemoProps) {
  const elevations = compact
    ? (["raised", "inset"] as const)
    : (["raised", "raised-sm", "inset", "inset-sm", "flat"] as const);

  return (
    <div className="space-y-6">
      <DemoSection title={compact ? "代表形态" : "阴影层级"}>
        {elevations.map((elevation) => (
          <NeuSurface
            key={elevation}
            elevation={elevation}
            className="grid min-h-20 min-w-28 place-items-center p-4 text-xs font-medium"
          >
            {elevation}
          </NeuSurface>
        ))}
      </DemoSection>
      {!compact ? (
        <DemoSection title="密度与圆角">
          {(["compact", "default", "comfortable"] as const).map((density) => (
            <NeuPanel
              key={density}
              density={density}
              radius={density === "compact" ? "sm" : density === "comfortable" ? "xl" : "lg"}
            >
              <span className="text-sm font-medium">{density}</span>
              <span className="text-xs text-muted-foreground">真实内容区域</span>
            </NeuPanel>
          ))}
        </DemoSection>
      ) : null}
    </div>
  );
}

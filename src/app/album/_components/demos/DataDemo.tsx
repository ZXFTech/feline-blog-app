import type { DemoProps } from "@/app/album/_components/catalog";
import { DemoSection } from "@/app/album/_components/demos/DemoSection";
import Icon from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function ExampleCard({ compact }: { compact?: boolean }) {
  return (
    <Card className="w-full max-w-sm" size={compact ? "sm" : "default"}>
      <CardHeader>
        <CardTitle>Album 条目</CardTitle>
        <CardDescription>固定本地数据，不触发业务请求。</CardDescription>
        <CardAction>
          <Badge variant="success">ready</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <p>展示默认形态、尺寸、状态和主题。</p>
        <Separator />
        <p className="text-muted-foreground">import: @/components/ui/card</p>
      </CardContent>
      {!compact ? (
        <CardFooter className="gap-2 text-sm">
          <Icon icon="check" theme="success" />
          <span>已纳入目录</span>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export default function DataDemo({ compact = false }: DemoProps) {
  if (compact) return <ExampleCard compact />;
  return (
    <div className="space-y-6">
      <DemoSection title="卡片结构">
        <ExampleCard />
        <ExampleCard compact />
      </DemoSection>
      <DemoSection title="图标尺寸">
        {(["xs", "sm", "md", "lg", "xl", "2xl", "3xl"] as const).map((size) => (
          <span key={size} className="inline-flex items-center gap-1 text-xs">
            <Icon icon="pets" size={size} />
            <span>{size}</span>
          </span>
        ))}
      </DemoSection>
    </div>
  );
}

import Content from "@/components/Content";
import { NeuPanel } from "@/components/ui/neu-panel";

export default function ChecklistsLoading() {
  return (
    <Content>
      <main>
        <NeuPanel density="comfortable">
          <p role="status" className="text-sm text-muted-foreground">
            正在读取你的清单…
          </p>
        </NeuPanel>
      </main>
    </Content>
  );
}

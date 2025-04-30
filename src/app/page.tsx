import NeuButton from "@/components/NeuButton/neuButton";
import Button from "../components/Button/button";
import Icon from "../components/Icon/icon";
import NeuDiv from "@/components/NeuDiv/NeuDiv";

export default function Home() {
  return (
    <NeuDiv className="neu-light">
      <NeuDiv className="flex items-center gap-2">
        <span className="text-sm">icon:</span>
        <Icon theme="danger" icon="search" />
      </NeuDiv>
      <NeuDiv className="flex items-center gap-2">
        <span className="text-sm">button:</span>
        <Button icon="search" loading>
          测试
        </Button>
        <NeuButton icon="search" loading>
          测试
        </NeuButton>
      </NeuDiv>
      <NeuDiv neuType="debossed" className="flex items-center gap-2">
        <span className="text-sm">button:</span>
        <Button icon="search" loading>
          测试
        </Button>
        <NeuButton icon="search" loading>
          测试
        </NeuButton>
      </NeuDiv>
    </NeuDiv>
  );
}

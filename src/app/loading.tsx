import { IconSpinner } from "@/components/Icon/presetIcon";

const Loading = () => {
  return (
    <div className="h-[100vh] neu-light flex justify-center items-center">
      <IconSpinner size="2xl" />
    </div>
  );
};

export default Loading;

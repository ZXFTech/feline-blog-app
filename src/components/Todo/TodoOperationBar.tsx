import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import NeuButton from "../NeuButton/neuButton";
import NeuDiv from "../NeuDiv/NeuDiv";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TodoSearchParams } from "@/types/todo";
import NeuInput from "../NeuInput";
import { debounce } from "@/utils/debounce ";

interface TodoOperationBarProps {
  setPanelVisible: Dispatch<SetStateAction<boolean>>;
  refresh: () => void;
}

const TODO_STATUS_BUTTON_LIST = [
  {
    id: 0,
    label: "全部",
    status: "",
  },
  {
    id: 1,
    label: "未完成",
    status: "false",
  },
  {
    id: 2,
    label: "已完成",
    status: "true",
  },
];

export const TodoOperationBar = ({ refresh }: TodoOperationBarProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [orderBy, setOrderBy] = useState<boolean>(true);
  const [todoStatus, setTodoStatus] = useState<string>("");

  const updateSearchParams = useCallback(
    (key: keyof TodoSearchParams, value: string) => {
      const params = new URLSearchParams(searchParams);

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }

      console.log("params", params.toString());
      router.replace(`${pathname}?${params}`);
      refresh();
    },
    [searchParams, router, pathname, refresh]
  );

  const debounceUpdate = useMemo(
    () =>
      debounce(
        (key: keyof TodoSearchParams, value: string) =>
          updateSearchParams(key, value),
        500
      ),
    [updateSearchParams]
  );

  const switchTodoStatus = (status: string) => {
    setTodoStatus(status);
  };

  const switchOrderBy = () => {
    setOrderBy((prev) => !prev);
  };

  useEffect(() => {
    updateSearchParams("orderBy", orderBy ? "desc" : "asc");
  }, [orderBy, updateSearchParams]);

  useEffect(() => {
    updateSearchParams("finished", todoStatus !== null ? todoStatus : "");
  }, [todoStatus, updateSearchParams]);

  return (
    <div className="flex flex-col gap-4 mt-4 sticky right-0 left-0 top-0 z-100">
      <NeuDiv
        neuType="flat"
        className="flex flex-row flex-wrap items-center justify-between"
      >
        <div className="flex flex-row gap-2">
          <NeuInput
            onChange={(e) => debounceUpdate("content", e.target.value)}
          />
          <NeuButton className="p-1!" onClick={switchOrderBy}>
            <span className="font-medium tracking-wider">
              {orderBy ? "升序" : "降序"}
            </span>
          </NeuButton>
        </div>
        <NeuDiv neuType="flat" className="flex flex-row-reverse flex-wrap ">
          {TODO_STATUS_BUTTON_LIST.map((item) => (
            <NeuButton
              buttonType={`${
                todoStatus === item.status ? "primary" : "default"
              }`}
              key={item.id}
              // className={`${
              //   todoStatus === item.status ? "bg-cyan-500! text-white!" : ""
              // }`}
              onClick={() => switchTodoStatus(item.status)}
            >
              <span className="font-medium tracking-wider">{item.label}</span>
            </NeuButton>
          ))}
        </NeuDiv>
      </NeuDiv>
    </div>
  );
};

"use client";

import React, {
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
  ReactNode,
  useCallback,
} from "react";

export interface InfiniteRulerHandle {
  scrollToValue: (value: number, smooth?: boolean) => void;
  getCurrentValue: () => number;
  reset: (values?: number[]) => void;
}

interface InfiniteRulerProps {
  step?: number;
  minorStep?: number;
  unit?: string;
  width?: number;
  height?: number;
  initialValue?: number;
  buffer?: number;
  inertia?: boolean;
  itemWidth?: number;
  showPointer?: boolean;
  scrollDebounce?: number;
  minValue?: number;
  maxValue?: number;
  renderItem?: (value: number) => ReactNode;
  onChange?: (value: number) => void;
}

const InfiniteRuler = forwardRef<InfiniteRulerHandle, InfiniteRulerProps>(
  (
    {
      step = 10,
      minorStep = 2,
      unit = "",
      width = 600,
      height = 60,
      initialValue = 25,
      buffer = 10,
      inertia = true,
      itemWidth = 100,
      showPointer = true,
      scrollDebounce = 100,
      minValue,
      maxValue,
      renderItem,
      onChange,
    },
    ref,
  ) => {
    const [values, setValues] = useState<number[]>(
      Array.from({ length: 50 }, (_, i) => i),
    );
    const scrollRef = useRef<HTMLDivElement>(null);

    // 拖动状态
    const isDragging = useRef(false);
    const startX = useRef(0);
    const scrollLeftStart = useRef(0);

    // 惯性滚动
    const velocity = useRef(0);
    const lastX = useRef(0);
    const lastTime = useRef(0);
    const momentumFrame = useRef<number | null>(null);

    // 初始化滚动
    useEffect(() => {
      const container = scrollRef.current;
      if (!container) return;
      container.scrollLeft =
        initialValue * itemWidth - container.clientWidth / 2;
    }, [initialValue, itemWidth]);

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      scrollToValue: (value: number, smooth = true) => {
        const container = scrollRef.current;
        if (!container) return;
        const targetScrollLeft =
          value * itemWidth - itemWidth / 2 - container.clientWidth / 2;
        container.scrollTo({
          left: targetScrollLeft,
          behavior: smooth ? "smooth" : "auto",
        });
      },
      getCurrentValue: () => {
        const container = scrollRef.current;
        if (!container) return 0;
        const center = container.scrollLeft + container.clientWidth / 2;
        const items = Array.from(container.children) as HTMLDivElement[];
        let closestItem = items[0];
        let minDistance = Infinity;
        items.forEach((item) => {
          const itemCenter = item.offsetLeft + item.clientWidth / 2;
          const distance = Math.abs(itemCenter - center);
          if (distance < minDistance) {
            minDistance = distance;
            closestItem = item;
          }
        });
        return parseInt(closestItem.textContent || "0");
      },
      reset: (newValues?: number[]) => {
        if (newValues && newValues.length) setValues(newValues);
      },
    }));

    // 无限滚动
    const handleInfiniteScroll = useCallback(() => {
      const container = scrollRef.current;
      if (!container) return;
      const scrollLeft = container.scrollLeft;
      const clientWidth = container.clientWidth;
      const scrollWidth = container.scrollWidth;

      // 左扩展
      if (scrollLeft < 10) {
        const newArr = Array.from(
          { length: buffer },
          (_, i) => values[0] - buffer + i,
        ).concat(values.slice(0, values.length - buffer));
        if (minValue === undefined || newArr[0] >= minValue) setValues(newArr);
        container.scrollLeft = scrollLeft + itemWidth * buffer;
      }

      // 右扩展
      if (scrollLeft + clientWidth > scrollWidth - 20) {
        const newArr = values
          .slice(buffer)
          .concat(
            Array.from(
              { length: buffer },
              (_, i) => values[values.length - 1] + 1 + i,
            ),
          );
        if (maxValue === undefined || newArr[newArr.length - 1] <= maxValue) {
          setValues(newArr);
          container.scrollLeft = scrollLeft - itemWidth * buffer;
        }
      }
    }, [values, buffer, minValue, maxValue, itemWidth]);

    // 居中最近元素
    const centerNearestItem = useCallback(() => {
      const container = scrollRef.current;
      if (!container) return;
      const center = container.scrollLeft + container.clientWidth / 2;
      const items = Array.from(container.children) as HTMLDivElement[];
      let closestItem = items[0];
      let minDistance = Infinity;
      items.forEach((item) => {
        const itemCenter = item.offsetLeft + item.clientWidth / 2;
        const distance = Math.abs(itemCenter - center);
        if (distance < minDistance) {
          minDistance = distance;
          closestItem = item;
        }
      });

      const targetScrollLeft =
        closestItem.offsetLeft +
        closestItem.clientWidth / 2 -
        container.clientWidth / 2;

      container.scrollTo({ left: targetScrollLeft, behavior: "smooth" });
      onChange?.(parseInt(closestItem.textContent || "0"));
    }, [onChange]);

    // 鼠标拖动 + 惯性滚动
    useEffect(() => {
      const container = scrollRef.current;
      if (!container) return;

      const onMouseDown = (e: MouseEvent) => {
        isDragging.current = true;
        startX.current = e.pageX - container.offsetLeft;
        scrollLeftStart.current = container.scrollLeft;
        lastX.current = e.pageX;
        lastTime.current = Date.now();

        container.style.cursor = "grabbing";
        container.style.userSelect = "none";

        if (momentumFrame.current) {
          cancelAnimationFrame(momentumFrame.current);
          momentumFrame.current = null;
        }
      };

      const onMouseMove = (e: MouseEvent) => {
        if (!isDragging.current) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const walk = x - startX.current;
        container.scrollLeft = scrollLeftStart.current - walk;

        if (!inertia) return;

        const now = Date.now();
        const dt = now - lastTime.current;
        if (dt > 0) {
          velocity.current = (lastX.current - e.pageX) / dt;
          lastX.current = e.pageX;
          lastTime.current = now;
        }
      };

      const onMouseUp = () => {
        if (!isDragging.current) return;
        isDragging.current = false;
        container.style.cursor = "grab";
        container.style.removeProperty("user-select");

        if (inertia) {
          const decay = 0.95;
          const step = () => {
            if (Math.abs(velocity.current) < 0.01) {
              centerNearestItem();
              return;
            }
            container.scrollLeft += velocity.current * 20;
            velocity.current *= decay;
            handleInfiniteScroll();
            momentumFrame.current = requestAnimationFrame(step);
          };
          momentumFrame.current = requestAnimationFrame(step);
        } else {
          centerNearestItem();
        }
      };

      container.addEventListener("mousedown", onMouseDown);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      return () => {
        container.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    }, [values, inertia, handleInfiniteScroll, centerNearestItem]);

    // 监听 scroll 事件，实现无限滚动 + 滚动结束检测
    useEffect(() => {
      const container = scrollRef.current;
      if (!container) return;
      let scrollTimeout: NodeJS.Timeout;

      const handleScroll = () => {
        handleInfiniteScroll();
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          centerNearestItem();
        }, scrollDebounce);
      };

      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }, [values, handleInfiniteScroll, centerNearestItem, scrollDebounce]);

    return (
      <div className="relative">
        {showPointer && (
          <div className="absolute h-4 w-1 bg-red-500! left-[50%] transform -translate-x-1/2 z-10" />
        )}
        <div
          ref={scrollRef}
          className="w-full overflow-x-scroll border cursor-grab flex hide-scrollbar"
          style={{ width, height }}
        >
          {values.map((v) =>
            renderItem ? (
              <React.Fragment key={v}>{renderItem(v)}</React.Fragment>
            ) : (
              <div
                key={v}
                className="w-[100px] flex-shrink-0 text-center border-r"
              >
                {v}
              </div>
            ),
          )}
        </div>
      </div>
    );
  },
);

InfiniteRuler.displayName = "InfiniteRuler";

export default InfiniteRuler;

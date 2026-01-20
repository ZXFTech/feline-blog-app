import classNames from "classnames";
import React, { useRef, useState, useEffect, useCallback } from "react";

interface InfiniteRulerProps {
  step?: number; // 主刻度间隔
  minorStep?: number; // 次刻度间隔
  unit?: string; // 单位
  width?: number; // 可视宽度
  height?: number; // 高度
  targetValue?: number; // 初始居中的刻度
  onChange?: (value: number) => void; // 滚动结束回调
  allowGrab?: boolean; // 是否全程抓取
}

const InfiniteRuler: React.FC<InfiniteRulerProps> = ({
  step = 10,
  minorStep = 2,
  unit = "",
  width = 600,
  height = 60,
  targetValue = 25,
  onChange,
  allowGrab = true,
}) => {
  const range = 10; // 每次左右扩展的刻度数量
  const [values, setValues] = useState<number[]>(
    Array.from({ length: 50 }, (_, i) => i),
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  // 拖动状态
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);

  // 惯性滚动状态
  const velocity = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const momentumFrame = useRef<number | null>(null);

  const scrollToValue = (value: number) => {
    const container = scrollRef.current;
    if (!container) return;

    const itemWidth = container.children[0].clientWidth;
    const containerWidth = container.clientWidth;
    const targetScrollLeft = value * itemWidth - containerWidth / 2;
    container.scrollLeft = targetScrollLeft;
  };

  // 初始化滚动到 targetValue
  useEffect(() => {
    scrollToValue(targetValue);
  }, [targetValue]);
  // 无限滚动逻辑
  const handleInfiniteScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const scrollLeft = container.scrollLeft;
    const clientWidth = container.clientWidth;
    const scrollWidth = container.scrollWidth;
    const itemWidth = container.children[0].clientWidth;

    // 左边扩展
    if (scrollLeft < 10) {
      const newArr = Array.from(
        { length: range },
        (_, i) => values[0] - range + i,
      ).concat(values.slice(0, values.length - range));
      setValues(newArr);
      container.scrollLeft = scrollLeft + itemWidth * range;
    }

    // 右边扩展
    if (scrollLeft + clientWidth > scrollWidth - 10) {
      const newArr = values
        .slice(range)
        .concat(
          Array.from(
            { length: range },
            (_, i) => values[values.length - 1] + 1 + i,
          ),
        );
      setValues(newArr);
      container.scrollLeft = scrollLeft - itemWidth * range;
    }
  }, [values]);

  // 滚动结束后居中最近元素
  const centerNearestItem = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const items = Array.from(container.children) as HTMLDivElement[];
    const center = container.scrollLeft + container.clientWidth / 2;

    let closestItem: HTMLDivElement = items[0];
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
    console.log("targetScrollLeft", targetScrollLeft);
    container.scrollTo({ left: targetScrollLeft, behavior: "smooth" });
    onChange?.(parseInt(closestItem.textContent || "0"));
  }, [onChange]);

  // 鼠标拖动 + 惯性滚动
  useEffect(() => {
    if (!allowGrab) {
      return;
    }
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

      // 停止惯性
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

      // 计算速度
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

      // 惯性滚动
      const decay = 0.95; // 阻力系数
      const step = () => {
        if (Math.abs(velocity.current) < 0.01) {
          // 滚动结束后自动居中
          centerNearestItem();
          return;
        }
        container.scrollLeft += velocity.current * 20; // 放大系数
        velocity.current *= decay;

        handleInfiniteScroll();
        momentumFrame.current = requestAnimationFrame(step);
      };

      momentumFrame.current = requestAnimationFrame(step);
    };

    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [values, handleInfiniteScroll, centerNearestItem, allowGrab]);

  // 监听 scroll 事件，实现无限滚动 + 自动居中（滚动停止检测）
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      handleInfiniteScroll();

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        centerNearestItem();
      }, 150); // 150ms 内无滚动认为滚动结束
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [values]);

  return (
    <div className="relative">
      {/* 中间指针 */}
      <div className="absolute h-4 w-[20px] bg-red-500 left-[50%] transform -translate-x-1/2 z-10" />

      <div
        ref={scrollRef}
        className={classNames(
          "w-full overflow-x-scroll h-10 border flex hide-scrollbar",
          {
            "cursor-grab": allowGrab,
          },
        )}
        style={{ width, height }}
      >
        {values.map((v) => (
          <div
            key={v}
            className="h-4 w-[100px] flex-shrink-0 text-center border-r"
          >
            {v}
          </div>
        ))}
      </div>
    </div>
  );
};

export default InfiniteRuler;

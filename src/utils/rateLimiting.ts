/**
 * 防抖函数
 * @param fn 要执行的函数
 * @param delay 延迟时间(毫秒)
 * @param options 配置选项
 * @returns 防抖处理后的函数
 */
function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number,
  options: {
    leading?: boolean;
    trailing?: boolean;
    maxWait?: number;
  } = {}
): (...args: Parameters<T>) => void {
  const { leading = false, trailing = true, maxWait } = options;

  let timerId: ReturnType<typeof setTimeout> | null = null;
  let lastCallTime: number | null = null;
  let lastInvokeTime: number = 0;
  let lastArgs: Parameters<T> | null = null;

  // 清除定时器
  const clearTimer = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  // 执行函数
  const invokeFunc = () => {
    if (lastArgs) {
      fn(...(lastArgs as Parameters<T>));
      lastInvokeTime = Date.now();
      lastArgs = null;
    }
  };

  // 计算剩余延迟时间
  const remainingDelay = () => {
    if (!lastCallTime) {
      return 0;
    }
    const timeSinceLastCall = Date.now() - lastCallTime;
    const timeSinceLastInvoke = Date.now() - lastInvokeTime;

    if (maxWait) {
      return Math.min(delay - timeSinceLastCall, maxWait - timeSinceLastInvoke);
    }

    return delay - timeSinceLastCall;
  };

  // 延迟执行
  const timerExpired = () => {
    const timeRemaining = remainingDelay();

    if (timeRemaining <= 0) {
      clearTimer();
      if (trailing && lastArgs) {
        invokeFunc();
      }
    } else {
      timerId = setTimeout(timerExpired, timeRemaining);
    }
  };

  // 开始延迟
  const startTimer = () => {
    clearTimer();
    timerId = setTimeout(timerExpired, delay);
  };

  return function debounced(...args: Parameters<T>): void {
    const now = Date.now();
    const isLeading = leading && !timerId;

    lastArgs = args;
    lastCallTime = now;

    if (isLeading) {
      // 立即执行
      invokeFunc();
      startTimer();
    } else if (!timerId) {
      // 首次调用
      startTimer();
    } else if (maxWait) {
      // 如果超过最大等待执行时间则立即执行
      const timeSinceLastInvoke = now - lastInvokeTime;
      if (timeSinceLastInvoke >= maxWait) {
        invokeFunc();
        startTimer();
      }
    }
  };
}

export type ThrottleOptions = {
  leading?: boolean; // 是否立即执行
  trailing?: boolean; // 是否在结束后补一次
};

export type ThrottledFunction<T extends (...args: Parameters<T>) => void> = {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
};

function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  wait: number,
  options: ThrottleOptions = {}
): ThrottledFunction<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastInvokeTime: number | null = null;
  const { leading = true, trailing = true } = options;
  let lastArgs: Parameters<T> | null = null;

  function invoke(time: number) {
    lastInvokeTime = time;
    fn(...(lastArgs as Parameters<T>));
    lastArgs = null;
  }
  const throttled = function (...args: Parameters<T>) {
    const now = Date.now();
    lastArgs = args;
    if (lastInvokeTime === null) {
      // 首次
      lastInvokeTime = now;
      if (leading) {
        // 开始先触发一次
        invoke(now);
      }
    }

    const remaining = wait - (now - lastInvokeTime);

    if (remaining < 0) {
      // 到时间了
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      invoke(now);
    } else if (!timer && trailing) {
      timer = setTimeout(() => {
        timer = null;
        if (lastArgs) {
          invoke(Date.now());
        }
      }, remaining);
    }
  } as ThrottledFunction<T>;

  throttled.flush = () => {
    // 立即执行一次
    if (timer) {
      clearTimeout(timer);
      timer = null;
      if (lastArgs) {
        invoke(Date.now());
      }
    }
  };

  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = null;
    lastInvokeTime = null;
    lastArgs = null;
  };

  return throttled;
}

export { debounce, throttle };

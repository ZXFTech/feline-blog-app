/**
 * 防抖函数
 * @param fn 要执行的函数
 * @param delay 延迟时间(毫秒)
 * @param options 配置选项
 * @returns 防抖处理后的函数
 */
function debounce<T extends (...args: any[]) => any>(
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
      fn(...lastArgs);
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

export { debounce };

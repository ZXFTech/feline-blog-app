import { fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { BlogReadingNavigation, consumeReadingTraversal } from "@/lib/blog/navigation";

afterEach(() => history.replaceState(null, "", "/"));

// AC-6: a missing shell listener loses traversals while no article is mounted;
// failing to consume a marker misclassifies a future ordinary visit.
it("在没有阅读实例时记录一次历史事件，消费后清除，卸载后移除监听", () => {
  const { unmount } = render(<BlogReadingNavigation />);
  history.replaceState({ preserved: true }, "", "/blog/17#chapter");
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(consumeReadingTraversal("http://localhost:3000/blog/other")).toBe(false);
  expect(consumeReadingTraversal(location.href)).toBe(false);
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(consumeReadingTraversal(location.href)).toBe(true);
  expect(consumeReadingTraversal(location.href)).toBe(false);
  expect(history.state).toEqual({ preserved: true });
  unmount();
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(consumeReadingTraversal(location.href)).toBe(false);
});

// AC-5, AC-6: a new visit must not inherit an unconsumed back/forward marker.
it("历史目的尚未注册时，新的普通链接使旧标记失效", () => {
  render(
    <>
      <BlogReadingNavigation />
      <a href="#other" onClick={(event) => event.preventDefault()}>
        新导航
      </a>
    </>
  );
  history.replaceState(null, "", "/blog/17#chapter");
  window.dispatchEvent(new PopStateEvent("popstate"));
  fireEvent.click(document.querySelector("a")!);
  expect(consumeReadingTraversal(location.href)).toBe(false);
});

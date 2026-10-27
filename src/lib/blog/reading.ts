export interface ReadingHeading {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  element: HTMLHeadingElement;
}

export function collectHeadings(body: HTMLElement): ReadingHeading[] {
  return Array.from(body.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6"))
    .filter((element) => element.id && element.textContent?.trim())
    .map((element) => ({
      id: element.id,
      text: element.textContent?.trim() ?? "",
      level: Number(element.tagName[1]) as ReadingHeading["level"],
      element,
    }));
}

export function resolveFragment(hash: string, headings: ReadingHeading[]) {
  try {
    const id = decodeURIComponent(hash.slice(1));
    return headings.find((heading) => heading.id === id) ?? null;
  } catch {
    return null;
  }
}

export function readingSnapshot(
  bodyTop: number,
  bodyBottom: number,
  top: number,
  bottom: number,
  headings: { id: string; top: number }[]
): { value: number | null; activeId: string | null } {
  const height = bodyBottom - bodyTop;
  const viewport = bottom - top;
  const valid = [height, viewport, top, bodyTop].every(Number.isFinite);
  const value =
    !valid || viewport <= 0 || height <= viewport + 1
      ? null
      : Math.min(100, Math.max(0, ((top - bodyTop) / (height - viewport)) * 100));
  let activeId: string | null = null;
  for (const heading of headings) {
    if (heading.top <= top + 1) activeId = heading.id;
  }
  if (value === 100 && headings.length) activeId = headings[headings.length - 1].id;
  return { value, activeId };
}

export function findReadingRoot(body: HTMLElement): HTMLElement | null {
  for (
    let parent = body.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY) && parent.clientHeight > 0) {
      return parent;
    }
  }
  return null;
}

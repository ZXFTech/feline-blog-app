"use client";

import { useEffect, useRef, useState } from "react";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function TOC() {
  const articleRef = useRef<HTMLElement | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<Element | null>(null);

  useEffect(() => {
    const article = document.getElementById("blog-container");

    if (!article) {
      return;
    }

    articleRef.current = article;

    const container = document.getElementById("content");
    if (container) {
      containerRef.current = container;
      console.log("container", container);
    }

    const headings = Array.from(article.querySelectorAll("h1,h2,h3"));

    setToc(
      headings.map((el) => ({
        id: el.id,
        text: el.textContent || "",
        level: Number(el.tagName[1]),
      })),
    );
  }, []);

  useEffect(() => {
    if (!articleRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entries) => {
          if (entries.isIntersecting) {
            setActiveId(entries.target.id);
          }
        });
      },
      {
        rootMargin: "-80px 0px -70% 0px",
        threshold: 0,
      },
    );

    toc.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  });

  useEffect(() => {
    const article = articleRef.current;
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let ticking = false;

    const onScroll = () => {
      console.log("111", 111);
      if (ticking) {
        return;
      }
      ticking = true;
      requestAnimationFrame(() => {
        console.log("container.clientHeight", container.clientHeight);
        const total = container?.scrollHeight - container.clientHeight;
        const top = container.scrollTop;
        const current = top;
        setProgress(total > 0 ? current / total : 0);
        ticking = false;
      });
    };

    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    console.log("progress", progress);
  }, [progress]);

  return (
    <div className="">
      {/* 进度条 */}
      {/* <div className="sticky-header fixed top-22 left-0 right-0 h-2 bg-white z-100">
        <div
          className="progress-bar bg-black h-full"
          style={{ transform: `scaleX(${progress})`, transformOrigin: "left" }}
        />
      </div> */}
      {/* 目录 */}
      <aside className="toc">
        <div className=" rounded-lg border border-gray-200 p-4">
          <h3 className="font-bold text-sm mb-4">本文内容</h3>
          <nav className="space-y-1 text-sm">
            {toc.map((heading, i) => (
              <button
                key={heading.id + "_" + i}
                onClick={() =>
                  document
                    .getElementById(heading.id)
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className={`w-full text-left px-3 py-2 rounded transition ${
                  activeId === heading.id
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
                style={{ paddingLeft: `${12 + (heading.level - 1) * 12}px` }}
              >
                {heading.id}
              </button>
            ))}
          </nav>
        </div>
      </aside>
    </div>
  );
}

export default TOC;

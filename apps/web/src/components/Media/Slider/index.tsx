"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useWheelForHorizontalScroll } from "@/hooks/useWheelForHorizontalScroll";

interface SliderProps {
  sliderKey: string;
  items?: ReactElement[];
  isLoading?: boolean;
  isEmpty?: boolean;
}

enum Direction {
  RIGHT,
  LEFT,
}

export function Slider({ sliderKey, items = [], isLoading = false, isEmpty = false }: SliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollPos, setScrollPos] = useState({ isStart: true, isEnd: false });
  const handleWheel = useWheelForHorizontalScroll(containerRef);

  const handleScroll = useCallback(() => {
    const scrollWidth = containerRef.current?.scrollWidth ?? 0;
    const clientWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
    const scrollPosition = containerRef.current?.scrollLeft ?? 0;

    if (!items || items?.length === 0) {
      setScrollPos({ isStart: true, isEnd: true });
    } else if (clientWidth >= scrollWidth) {
      setScrollPos({ isStart: true, isEnd: true });
    } else if (scrollPosition >= scrollWidth - clientWidth - 10) {
      setScrollPos({ isStart: false, isEnd: true });
    } else if (scrollPosition > 0) {
      setScrollPos({ isStart: false, isEnd: false });
    } else {
      setScrollPos({ isStart: true, isEnd: false });
    }
  }, [items]);

  useEffect(() => {
    const handleResize = () => {
      handleScroll();
    };

    window.addEventListener("resize", handleResize, { passive: true });
    const resizeId = window.setTimeout(handleScroll, 0);

    return () => {
      window.clearTimeout(resizeId);
      window.removeEventListener("resize", handleResize);
    };
  }, [handleScroll]);

  useEffect(() => {
    const id = window.setTimeout(handleScroll, 0);
    return () => window.clearTimeout(id);
  }, [items, handleScroll]);

  const slide = (direction: Direction) => {
    const clientWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
    const cardWidth = containerRef.current?.firstElementChild?.getBoundingClientRect().width ?? 0;
    const scrollPosition = containerRef.current?.scrollLeft ?? 0;
    const visibleItems = Math.floor(clientWidth / cardWidth);

    if (direction === Direction.LEFT) {
      const newX = Math.max(scrollPosition - visibleItems * cardWidth, 0);
      containerRef.current?.scrollTo({ left: newX, behavior: "smooth" });
    } else if (direction === Direction.RIGHT) {
      const scrollWidth = containerRef.current?.scrollWidth ?? 0;
      const newX = Math.min(scrollPosition + visibleItems * cardWidth, scrollWidth - clientWidth);
      containerRef.current?.scrollTo({ left: newX, behavior: "smooth" });
    }
  };

  if (isEmpty && !isLoading) {
    return (
      <div className="mt-8 mb-8 text-center text-gray-400">
        <p>No results found</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute right-0 -mt-10 flex text-gray-400">
        <button
          className={`${scrollPos.isStart ? "text-gray-700" : "hover:text-white"}`}
          onClick={() => slide(Direction.LEFT)}
          disabled={scrollPos.isStart}
          type="button"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
        <button
          className={`${scrollPos.isEnd ? "text-gray-700" : "hover:text-white"}`}
          onClick={() => slide(Direction.RIGHT)}
          disabled={scrollPos.isEnd}
          type="button"
        >
          <ChevronRightIcon className="h-6 w-6" />
        </button>
      </div>
      <div
        className="hide-scrollbar relative -my-2 -ml-4 -mr-4 overflow-y-auto overflow-x-scroll overscroll-x-contain whitespace-nowrap px-2 py-2"
        ref={containerRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
      >
        {items?.map((item, index) => (
          <div key={`${sliderKey}-${index}`} className="inline-block px-2 align-top">
            {item}
          </div>
        ))}
        {isLoading &&
          [...Array(10)].map((_item, i) => (
            <div key={`placeholder-${i}`} className="inline-block px-2 align-top">
              <div className="h-56 w-36 animate-pulse rounded-xl bg-gray-800" />
            </div>
          ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import type { LessonSegment } from "@/lib/types";
import styles from "./LessonPanel.module.css";

type Props = {
  segments: LessonSegment[];
  currentSegmentIndex: number;
  onSelectSegment?: (index: number) => void;
};

export function SegmentList({
  segments,
  currentSegmentIndex,
  onSelectSegment,
}: Props) {
  const listRef = useRef<HTMLOListElement>(null);

  // Scrolls only the list; scrollIntoView could also move the page or the PDF column.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[currentSegmentIndex] as HTMLElement | undefined;
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) {
      list.scrollTop = item.offsetTop;
    } else if (
      item.offsetTop + item.offsetHeight >
      list.scrollTop + list.clientHeight
    ) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
    }
  }, [currentSegmentIndex]);

  return (
    <ol ref={listRef} className={styles.segmentList}>
      {segments.map((segment, index) => {
        const isCurrent = index === currentSegmentIndex;
        return (
          <li key={segment.id}>
            <button
              type="button"
              className={`${styles.segment} ${isCurrent ? styles.segmentCurrent : ""}`}
              aria-current={isCurrent ? "step" : undefined}
              onClick={() => onSelectSegment?.(index)}
            >
              <span className={styles.segmentGoal}>
                {index + 1}. {segment.goal}
              </span>
              <span className={styles.segmentPage}>p. {segment.page}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

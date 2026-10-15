"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ResultView } from "@/lib/result/view";
import { CustomerNavigation } from "@/app/CustomerNavigation";
import { ResultScreen } from "./ResultScreen";
import styles from "./result.module.css";

// A4 를 96dpi 로 환산한 크기(px). 화면 미리보기를 휴대폰 폭에 맞춰 줄일 때 쓴다.
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const PREVIEW_GUTTER_PX = 24;

function subscribeResize(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}
const getViewportWidth = () => window.innerWidth;
const getServerViewportWidth = () => A4_WIDTH_PX + PREVIEW_GUTTER_PX;

/**
 * 모바일 화면과 A4 결과지를 모두 렌더링하고, 보이는 쪽만 CSS 로 바꾼다.
 * - 화면: 기본은 모바일. [A4 출력] 을 누르면 A4 미리보기.
 * - 인쇄(@media print): 항상 A4 결과지만 인쇄된다.
 */
export function ResultClient({ view }: { view: ResultView }) {
  const [previewing, setPreviewing] = useState(false);
  const viewportWidth = useSyncExternalStore(subscribeResize, getViewportWidth, getServerViewportWidth);
  const printButtonRef = useRef<HTMLButtonElement | null>(null);
  const scale = Math.min(1, (viewportWidth - PREVIEW_GUTTER_PX) / A4_WIDTH_PX);

  useEffect(() => {
    if (previewing) {
      window.scrollTo(0, 0);
      printButtonRef.current?.focus();
    }
  }, [previewing]);

  return (
    <div className={styles.root} data-preview={previewing ? "true" : "false"}>
      {/* @page 는 전역 규칙이라 이 페이지가 열릴 때 함께 들어가도록 직접 넣는다. */}
      <style>{"@page { size: A4; margin: 0; }"}</style>

      <div className={styles.mobileArea}>
        <div className={styles.resultNavigation}><CustomerNavigation canEnd submitted /></div>
        <ResultScreen view={view} mode="mobile" onPrintPreview={() => setPreviewing(true)} />
      </div>

      <div className={styles.printArea}>
        <div className={styles.previewBar}>
          <p className={styles.previewHint}>
            인쇄 창에서 &apos;머리글 및 바닥글&apos;을 끄면 결과지가 깔끔하게 인쇄돼요.
          </p>
          <div className={styles.previewButtons}>
            <button
              type="button"
              className={styles.printButton}
              ref={printButtonRef}
              onClick={() => window.print()}
            >
              인쇄 / PDF 저장
            </button>
            <button type="button" className={styles.backButton} onClick={() => setPreviewing(false)}>
              돌아가기
            </button>
          </div>
        </div>

        <div
          className={styles.previewFrame}
          style={{ width: A4_WIDTH_PX * scale, height: A4_HEIGHT_PX * scale }}
        >
          <div className={styles.previewScale} style={{ transform: `scale(${scale})` }}>
            <ResultScreen view={view} mode="print" />
          </div>
        </div>
      </div>
    </div>
  );
}

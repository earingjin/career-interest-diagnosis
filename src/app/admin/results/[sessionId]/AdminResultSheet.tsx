"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ResultScreen } from "@/app/c/[courseCode]/result/ResultScreen";
import resultStyles from "@/app/c/[courseCode]/result/result.module.css";
import type { ResultView } from "@/lib/result/view";
import adminStyles from "../../admin.module.css";
import styles from "./detail.module.css";

// A4 를 96dpi 로 환산한 크기(px). 좁은 화면에서는 미리보기를 이 비율로 줄여 보여준다.
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const GUTTER_PX = 24;

function subscribeResize(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}
const getViewportWidth = () => window.innerWidth;
const getServerViewportWidth = () => A4_WIDTH_PX + GUTTER_PX;

type Props = {
  view: ResultView;
  /** 같은 날짜의 목록으로 돌아가는 주소 */
  listHref: string;
};

/**
 * 관리자 PC 에서 보는 A4 결과지 미리보기와 인쇄 버튼.
 * 결과지는 고객 화면과 같은 ResultScreen(mode="print") 이며, 인쇄 규칙(@page, A4 210x296mm)도
 * 고객 결과 화면의 result.module.css 를 그대로 쓴다. 이 화면의 도구 줄만 인쇄에서 제외한다.
 */
export function AdminResultSheet({ view, listHref }: Props) {
  const viewportWidth = useSyncExternalStore(subscribeResize, getViewportWidth, getServerViewportWidth);
  const scale = Math.min(1, (viewportWidth - GUTTER_PX) / A4_WIDTH_PX);

  return (
    // data-preview="true": 고객 화면의 "A4 미리보기" 상태와 같은 규칙으로 결과지를 보여준다.
    <div className={resultStyles.root} data-preview="true">
      {/* @page 는 전역 규칙이라 이 페이지가 열릴 때 함께 들어가도록 직접 넣는다. */}
      <style>{"@page { size: A4; margin: 0; }"}</style>

      <div className={styles.toolbar} data-admin-chrome="true">
        <Link prefetch={false} className={`${adminStyles.link} ${adminStyles.secondary}`} href={listHref}>
          ← 목록으로
        </Link>
        <p className={styles.title}>{view.nickname}님의 결과지 (A4 미리보기)</p>
        <button type="button" className={adminStyles.button} onClick={() => window.print()}>
          인쇄
        </button>
        <p className={styles.hint}>
          인쇄 창에서 &apos;머리글 및 바닥글&apos;을 끄고, 용지는 A4, 배율은 100% 로 선택해 주세요.
        </p>
      </div>

      <div className={resultStyles.printArea}>
        <div
          className={resultStyles.previewFrame}
          data-admin-sheet="true"
          style={{ width: A4_WIDTH_PX * scale, height: A4_HEIGHT_PX * scale }}
        >
          <div className={resultStyles.previewScale} style={{ transform: `scale(${scale})` }}>
            <ResultScreen view={view} mode="print" />
          </div>
        </div>
      </div>
    </div>
  );
}

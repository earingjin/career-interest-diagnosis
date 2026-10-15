"use client";

import type { ResultView } from "@/lib/result/view";
import { CustomerNavigation } from "@/app/CustomerNavigation";
import { ResultScreen } from "./ResultScreen";
import styles from "./result.module.css";

/** 고객에게는 전체 웹 결과만 제공한다. A4 출력은 인증된 관리자 화면에서만 제공한다. */
export function ResultClient({ view }: { view: ResultView }) {
  return (
    <div className={styles.root}>
      <div className={styles.resultNavigation}><CustomerNavigation canEnd submitted /></div>
      <ResultScreen view={view} mode="mobile" />
    </div>
  );
}

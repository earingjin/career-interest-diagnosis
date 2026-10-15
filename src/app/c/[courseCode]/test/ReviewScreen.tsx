"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { GENERAL_COUNT, MIN_ADJECTIVE_SELECTIONS } from "@/lib/session/progress";
import styles from "./TestFlow.module.css";

type Props = {
  courseCode: string;
  answeredCount: number;
  selectedCount: number;
  headingRef: RefObject<HTMLHeadingElement | null>;
  generalQuestions: { id: string; text: string }[];
  general: Record<string, boolean>;
  onEditGeneral: (number: number) => void;
  /** 첫 미응답 문항으로 이동 */
  onGoToFirstUnanswered: () => void;
  /** 형용사 화면으로 이동 */
  onGoToAdjectives: () => void;
  onBusyChange: (busy: boolean) => void;
  /** 응답 큐를 비운다. 끝난 뒤 남은 항목 수를 돌려준다. */
  drainQueue: () => Promise<number>;
};

const NETWORK_ERROR = "연결에 문제가 생겼어요. 잠시 후 다시 제출해 주세요.";
const PENDING_ERROR = "저장되지 않은 응답이 있어요. 연결을 확인한 뒤 다시 제출해 주세요.";

export function ReviewScreen({
  courseCode,
  answeredCount,
  selectedCount,
  headingRef,
  generalQuestions,
  general,
  onEditGeneral,
  onGoToFirstUnanswered,
  onGoToAdjectives,
  onBusyChange,
  drainQueue,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const missingGeneral = GENERAL_COUNT - answeredCount;
  const adjectivesShort = Math.max(0, MIN_ADJECTIVE_SELECTIONS - selectedCount);
  const ready = missingGeneral === 0 && adjectivesShort === 0;

  async function submit() {
    if (submittingRef.current || !ready) return;
    submittingRef.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);

    try {
      if ((await drainQueue()) > 0) throw new Error(PENDING_ERROR);
      const response = await fetch("/api/session/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseCode }),
      });
      const data = await response.json().catch(() => null);

      if (response.ok && data?.ok === true) {
        router.replace(`/c/${courseCode}/result`);
        return;
      }
      if (response.status === 409 && data?.error?.code === "ALREADY_SUBMITTED") {
        router.replace(`/c/${courseCode}/result`);
        return;
      }
      setError(data?.error?.message ?? NETWORK_ERROR);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === PENDING_ERROR ? PENDING_ERROR : NETWORK_ERROR);
    }
    submittingRef.current = false;
    setBusy(false);
    onBusyChange(false);
  }

  return (
    <>
      <div className={styles.reviewArea}>
        <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
          최종 제출
        </h1>

        <ul className={styles.summary}>
          <li>
            일반성향 응답 {answeredCount} / {GENERAL_COUNT}
          </li>
          <li>
            형용사 선택 {selectedCount}개 ({MIN_ADJECTIVE_SELECTIONS}개 이상이어야 제출할 수 있어요)
          </li>
        </ul>

        {!busy && (
          <>
            <details className={styles.reviewDetails}>
              <summary>일반성향 응답 확인·수정</summary>
              <ol className={styles.reviewList}>
                {generalQuestions.map((question, index) => (
                  <li key={question.id}>
                    <button type="button" className={styles.reviewItem} onClick={() => onEditGeneral(index + 1)}>
                      <span>{index + 1}. {question.text}</span>
                      <strong>{general[question.id] === undefined ? "미응답" : general[question.id] ? "예" : "아니요"} · 수정</strong>
                    </button>
                  </li>
                ))}
              </ol>
            </details>
            <button type="button" className={styles.secondary} onClick={onGoToAdjectives}>
              형용사 선택 확인·수정
            </button>
          </>
        )}

        {missingGeneral > 0 && (
          <div className={styles.notice}>
            <p>아직 응답하지 않은 문항이 {missingGeneral}개 있어요</p>
            <button type="button" className={styles.secondary} onClick={onGoToFirstUnanswered}>
              첫 미응답 문항으로
            </button>
          </div>
        )}
        {adjectivesShort > 0 && (
          <div className={styles.notice}>
            <p>형용사를 {adjectivesShort}개 더 고르면 제출할 수 있어요</p>
            <button type="button" className={styles.secondary} onClick={onGoToAdjectives}>
              고르러 가기
            </button>
          </div>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>

      <div className={styles.footer}>
        <p className={styles.body}>제출하면 응답을 수정할 수 없어요. 필요한 경우 위에서 응답을 수정해 주세요.</p>
        <button type="button" className={styles.primary} onClick={submit} disabled={!ready || busy}>
          {busy ? "제출하는 중…" : "검사 제출하기"}
        </button>

        <p className={styles.body} aria-live="polite">
          {busy ? "제출하고 있어요..." : ""}
        </p>
      </div>
    </>
  );
}

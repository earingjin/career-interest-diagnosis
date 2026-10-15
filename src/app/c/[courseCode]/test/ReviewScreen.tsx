"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { GENERAL_COUNT, MIN_ADJECTIVE_SELECTIONS } from "@/lib/session/progress";
import styles from "./TestFlow.module.css";

type Phase = "review" | "confirm" | "submitting" | "done";

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
  onBack: () => void;
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
  onBack,
  drainQueue,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("review");
  const [error, setError] = useState<string | null>(null);
  const [next, setNext] = useState(`/c/${courseCode}/result`);
  const confirmRef = useRef<HTMLParagraphElement | null>(null);

  const missingGeneral = GENERAL_COUNT - answeredCount;
  const adjectivesShort = Math.max(0, MIN_ADJECTIVE_SELECTIONS - selectedCount);
  const ready = missingGeneral === 0 && adjectivesShort === 0;

  // 확인 단계와 완료 화면으로 바뀌면 그 문구로 초점을 옮긴다.
  useEffect(() => {
    if (phase === "confirm") confirmRef.current?.focus();
    if (phase === "done") headingRef.current?.focus();
  }, [phase, headingRef]);

  async function submit() {
    setPhase("submitting");
    setError(null);

    // 못 보낸 응답이 있으면 먼저 보낸다. 남아 있으면 제출하지 않는다.
    if ((await drainQueue()) > 0) {
      setError(PENDING_ERROR);
      setPhase("review");
      return;
    }

    try {
      const response = await fetch("/api/session/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseCode }),
      });
      const data = await response.json().catch(() => null);

      if (response.ok && data?.ok === true) {
        if (typeof data.next === "string") setNext(data.next);
        setPhase("done");
        return;
      }
      if (response.status === 409 && data?.error?.code === "ALREADY_SUBMITTED") {
        router.replace(`/c/${courseCode}/result`);
        return;
      }
      setError(data?.error?.message ?? NETWORK_ERROR);
    } catch {
      setError(NETWORK_ERROR);
    }
    setPhase("review");
  }

  if (phase === "done") {
    return (
      <>
        <div className={styles.centerArea}>
          <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
            제출이 완료되었습니다.
          </h1>
          <p className={styles.body}>검사 결과는 이 휴대폰에서 확인할 수 있어요.</p>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.primary} onClick={() => router.push(next)}>
            결과 보기
          </button>
        </div>
      </>
    );
  }

  const busy = phase === "submitting";

  return (
    <>
      <div className={styles.reviewArea}>
        <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
          응답을 한 번 더 확인해 주세요
        </h1>

        <ul className={styles.summary}>
          <li>
            일반성향 응답 {answeredCount} / {GENERAL_COUNT}
          </li>
          <li>
            형용사 선택 {selectedCount}개 ({MIN_ADJECTIVE_SELECTIONS}개 이상이어야 제출할 수 있어요)
          </li>
        </ul>

        {phase === "review" && (
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
        {ready && phase === "review" && (
          <button type="button" className={styles.primary} onClick={() => setPhase("confirm")}>
            검사 제출하기
          </button>
        )}

        {ready && (phase === "confirm" || busy) && (
          <div className={styles.confirm}>
            <p className={styles.confirmText} tabIndex={-1} ref={confirmRef}>
              제출하면 응답을 바꿀 수 없어요. 제출할까요?
            </p>
            <button type="button" className={styles.primary} onClick={submit} disabled={busy}>
              네, 제출합니다
            </button>
            <button type="button" className={styles.secondary} onClick={() => setPhase("review")} disabled={busy}>
              아니요, 더 볼게요
            </button>
          </div>
        )}

        <p className={styles.body} aria-live="polite">
          {busy ? "제출하고 있어요..." : ""}
        </p>

        {phase === "review" && (
          <button type="button" className={styles.secondary} onClick={onBack}>
            ← 이전
          </button>
        )}
      </div>
    </>
  );
}

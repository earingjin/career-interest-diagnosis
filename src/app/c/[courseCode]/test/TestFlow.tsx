"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GENERAL_COUNT,
  MIN_ADJECTIVE_SELECTIONS,
  firstUnansweredGeneral,
  generalItemId,
  generalNumber,
  isKnownStep,
  isStepReachable,
  nextStep,
  prevStep,
  resolveResumeStep,
} from "@/lib/session/progress";
import { isStepItem, type PendingItem } from "@/lib/session/saveQueue";
import { ReviewScreen } from "./ReviewScreen";
import styles from "./TestFlow.module.css";
import { useResponseSaver } from "./useResponseSaver";

// 문항 유형(R, I, A …)은 화면과 서버가 넘겨주는 데이터 어디에도 없다. id 와 text 만 받는다.
export type TestItem = { id: string; text: string };

type Props = {
  courseCode: string;
  sessionId: string;
  currentStep: string;
  initialGeneral: Record<string, boolean>;
  initialAdjectives: string[];
  generalQuestions: TestItem[];
  adjectiveItems: TestItem[];
};

const ADVANCE_DELAY_MS = 300;

function resolveInitialStep(currentStep: string, general: Record<string, boolean>, adjectives: string[]): string {
  const counts = { answeredGeneralCount: Object.keys(general).length, selectedAdjectiveCount: adjectives.length };
  if (isKnownStep(currentStep) && isStepReachable(currentStep, counts)) return currentStep;
  return firstUnansweredGeneral(new Set(Object.keys(general))) ?? "part1-done";
}

export function TestFlow({
  courseCode,
  sessionId,
  currentStep,
  initialGeneral,
  initialAdjectives,
  generalQuestions,
  adjectiveItems,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState(() => resolveInitialStep(currentStep, initialGeneral, initialAdjectives));
  const [general, setGeneral] = useState<Record<string, boolean>>(initialGeneral);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialAdjectives));

  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const firstRenderRef = useRef(true);

  const answeredCount = Object.keys(general).length;
  const selectedCount = selected.size;

  const saver = useResponseSaver({
    courseCode,
    sessionId,
    onRestore: useCallback(
      (items: PendingItem[]) => {
        // 기기에 남아 있던 아직 못 보낸 응답이 서버 값보다 최신이다.
        const mergedGeneral = { ...initialGeneral };
        const mergedSelected = new Set(initialAdjectives);
        let pendingStep: string | null = null;
        for (const item of items) {
          if (isStepItem(item)) pendingStep = item.value;
          else if (item.itemId.startsWith("g")) mergedGeneral[item.itemId] = item.value;
          else if (item.value) mergedSelected.add(item.itemId);
          else mergedSelected.delete(item.itemId);
        }
        setGeneral(mergedGeneral);
        setSelected(mergedSelected);

        // 못 보낸 step 이 있으면 그 위치가 가장 최신이다. 갈 수 없는 단계면 무시하고, 응답 기록으로 위치를 보정한다.
        const counts = {
          answeredGeneralCount: Object.keys(mergedGeneral).length,
          selectedAdjectiveCount: mergedSelected.size,
        };
        setStep((prev) => {
          const candidate =
            pendingStep !== null && isKnownStep(pendingStep) && isStepReachable(pendingStep, counts)
              ? pendingStep
              : prev;
          return resolveResumeStep(candidate, new Set(Object.keys(mergedGeneral)));
        });
      },
      [initialGeneral, initialAdjectives],
    ),
    onSubmitted: useCallback(() => router.replace(`/c/${courseCode}/result`), [router, courseCode]),
  });

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current !== null) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  // 화면이 바뀌면 제목으로 초점을 옮겨 스크린 리더가 새 화면을 읽게 한다.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const go = useCallback(
    (target: string | null) => {
      if (target === null) return;
      if (advanceTimerRef.current !== null) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
      setStep(target);
      // 화면 위치는 응답과 같은 큐로 보낸다. 오프라인이어도 기기에 남아 다시 보낸다.
      saver.enqueueStep(target);
    },
    [saver],
  );

  /** 앞으로 갈 때 응답 개수 규칙을 확인한다. 못 가면 빠진 문항으로 보낸다. */
  const goForward = useCallback(
    (target: string | null, counts: { answeredGeneralCount: number; selectedAdjectiveCount: number }, answeredIds: string[]) => {
      if (target === null) return;
      if (isStepReachable(target, counts)) go(target);
      else go(firstUnansweredGeneral(new Set(answeredIds)));
    },
    [go],
  );

  function answerGeneral(n: number, value: boolean) {
    const id = generalItemId(n);
    const nextGeneral = { ...general, [id]: value };
    setGeneral(nextGeneral);
    saver.enqueue(id, value);

    if (advanceTimerRef.current !== null) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      goForward(
        nextStep(`general-${n}`),
        { answeredGeneralCount: Object.keys(nextGeneral).length, selectedAdjectiveCount: selectedCount },
        Object.keys(nextGeneral),
      );
    }, ADVANCE_DELAY_MS);
  }

  function toggleAdjective(id: string) {
    const nextValue = !selected.has(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (nextValue) next.add(id);
      else next.delete(id);
      return next;
    });
    saver.enqueue(id, nextValue);
  }

  const counts = { answeredGeneralCount: answeredCount, selectedAdjectiveCount: selectedCount };
  const answeredIds = Object.keys(general);
  const locked = saver.sessionLost;

  const generalTexts = new Map(generalQuestions.map((q) => [q.id, q.text]));
  const n = generalNumber(step);

  let screen;
  if (n !== null) {
    const id = generalItemId(n);
    const answer = general[id];
    const answered = answer !== undefined;
    screen = (
      <>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => go(prevStep(step))}
            disabled={prevStep(step) === null}
          >
            ← 뒤로
          </button>
          <p className={styles.counter}>
            전체 {n} / {GENERAL_COUNT}
          </p>
        </header>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="검사 진행"
          aria-valuemin={1}
          aria-valuemax={GENERAL_COUNT}
          aria-valuenow={n}
        >
          <div className={styles.progressFill} style={{ width: `${(n / GENERAL_COUNT) * 100}%` }} />
        </div>

        <div className={styles.questionArea}>
          <h1 className={styles.question} tabIndex={-1} ref={headingRef}>
            {generalTexts.get(id)}
          </h1>
        </div>

        <div className={styles.answers}>
          <button
            type="button"
            className={`${styles.answer} ${answer === true ? styles.selected : ""}`}
            aria-pressed={answer === true}
            onClick={() => answerGeneral(n, true)}
          >
            {answer === true && <span aria-hidden="true">✓ </span>}예
          </button>
          <button
            type="button"
            className={`${styles.answer} ${answer === false ? styles.selected : ""}`}
            aria-pressed={answer === false}
            onClick={() => answerGeneral(n, false)}
          >
            {answer === false && <span aria-hidden="true">✓ </span>}아니요
          </button>
        </div>

        <div className={styles.nextSlot}>
          {answered && (
            <button
              type="button"
              className={styles.primary}
              onClick={() => goForward(nextStep(step), counts, answeredIds)}
            >
              다음
            </button>
          )}
        </div>
      </>
    );
  } else if (step === "part1-done") {
    screen = (
      <>
        <div className={styles.centerArea}>
          <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
            일반성향 검사를 모두 마쳤습니다
          </h1>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.primary} onClick={() => goForward("adjectives-intro", counts, answeredIds)}>
            다음
          </button>
          <button type="button" className={styles.secondary} onClick={() => go(prevStep(step))}>
            ← 이전 문항 보기
          </button>
        </div>
      </>
    );
  } else if (step === "adjectives-intro") {
    screen = (
      <>
        <div className={styles.centerArea}>
          <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
            나에게 어울리는 말을 골라 주세요.
          </h1>
          <p className={styles.body}>최소 5개 이상 골라야 다음으로 갈 수 있어요.</p>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.primary} onClick={() => goForward("adjectives", counts, answeredIds)}>
            시작하기
          </button>
        </div>
      </>
    );
  } else if (step === "adjectives") {
    const enough = selectedCount >= MIN_ADJECTIVE_SELECTIONS;
    screen = (
      <>
        <header className={styles.adjectivesHeader}>
          <h1 className={styles.title} tabIndex={-1} ref={headingRef}>
            선택 {selectedCount}개 (최소 {MIN_ADJECTIVE_SELECTIONS}개)
          </h1>
          <p className={styles.hint} role="status">
            {enough ? "" : "몇 개 더 고르면 다음으로 갈 수 있어요"}
          </p>
        </header>
        <div className={styles.chips}>
          {adjectiveItems.map((item) => {
            const on = selected.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.chip} ${on ? styles.chipOn : ""}`}
                aria-pressed={on}
                onClick={() => toggleAdjective(item.id)}
              >
                {on && <span aria-hidden="true">✓ </span>}
                {item.text}
              </button>
            );
          })}
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.primary}
            disabled={!enough}
            onClick={() => goForward("review", counts, answeredIds)}
          >
            다음
          </button>
          <button type="button" className={styles.secondary} onClick={() => go(prevStep(step))}>
            ← 이전
          </button>
        </div>
      </>
    );
  } else {
    screen = (
      <ReviewScreen
        courseCode={courseCode}
        answeredCount={answeredCount}
        selectedCount={selectedCount}
        headingRef={headingRef}
        onGoToFirstUnanswered={() => go(firstUnansweredGeneral(new Set(answeredIds)))}
        onGoToAdjectives={() => goForward("adjectives", counts, answeredIds)}
        onBack={() => go(prevStep(step))}
        drainQueue={async () => {
          await saver.flush();
          return saver.pendingSize();
        }}
      />
    );
  }

  return (
    <main className={styles.main}>
      <div className={styles.status}>
        <div aria-live="polite">
          {saver.failed && (
            <p className={styles.warning}>저장되지 않은 응답이 있어요. 연결되면 자동으로 보낼게요</p>
          )}
        </div>
        {saver.pendingCount > 0 && !saver.failed && !saver.sessionLost && (
          <span className={styles.saving} aria-hidden="true">
            저장 중…
          </span>
        )}
        {saver.sessionLost && (
          <p role="alert" className={styles.lost}>
            다른 기기에서 이어서 진행해서 이 화면은 더 이상 저장되지 않아요.{" "}
            <a href={`/c/${courseCode}`}>처음 화면으로</a>
          </p>
        )}
      </div>
      <fieldset className={styles.flow} disabled={locked}>
        {screen}
      </fieldset>
    </main>
  );
}

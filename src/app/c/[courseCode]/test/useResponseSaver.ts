"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isStepItem,
  openOwnedQueue,
  type PendingItem,
  type QueueStorage,
  type SaveQueue,
} from "@/lib/session/saveQueue";

const RETRY_DELAY_MS = 5000;

type SendOutcome = "ok" | "drop" | "retry" | "lost" | "submitted";

function getStorage(): QueueStorage {
  try {
    return window.localStorage;
  } catch {
    // 저장소 접근이 막힌 환경: 이번 방문 동안만 메모리에 둔다.
    const memory: Record<string, string> = {};
    return {
      getItem: (key) => memory[key] ?? null,
      setItem: (key, value) => {
        memory[key] = value;
      },
    };
  }
}

async function send(courseCode: string, item: PendingItem): Promise<SendOutcome> {
  const isStep = isStepItem(item);
  try {
    const response = await fetch(isStep ? "/api/session/step" : "/api/session/response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isStep ? { courseCode, step: item.value } : { courseCode, itemId: item.itemId, value: item.value },
      ),
    });
    if (response.ok) return "ok";
    if (response.status === 401) return "lost"; // 다른 기기가 이어받았거나 세션이 사라짐
    if (response.status === 409) {
      // 제출 완료면 더 보낼 수 없다. step 이 아직 갈 수 없는 단계라는 409 는 다시 보내도 같으므로 버린다.
      const data = await response.json().catch(() => null);
      return data?.error?.code === "STEP_NOT_REACHABLE" ? "drop" : "submitted";
    }
    // 형식이 잘못된 항목은 다시 보내도 성공하지 않으므로 버린다.
    if (response.status === 400) return "drop";
    return "retry";
  } catch {
    return "retry";
  }
}

type Options = {
  courseCode: string;
  sessionId: string;
  /** 페이지를 열 때 기기에 남아 있던 대기 항목(응답과 step)을 화면 상태에 반영한다. */
  onRestore: (items: PendingItem[]) => void;
  onSubmitted: () => void;
};

/**
 * 응답과 화면 위치(step)를 저장 큐에 넣고, 큐의 항목을 순서대로 하나씩만 서버로 보낸다.
 * step 은 항상 응답 뒤에 처리된다 (서버가 응답 개수로 단계를 검사하기 때문).
 * 실패한 항목은 큐에 남기고 5초 뒤 다시 보낸다 (연결이 돌아오면 바로 보낸다).
 */
export function useResponseSaver({ courseCode, sessionId, onRestore, onSubmitted }: Options) {
  const queueRef = useRef<SaveQueue | null>(null);
  const flushPromiseRef = useRef<Promise<void> | null>(null);
  const rerunRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const onRestoreRef = useRef(onRestore);
  const onSubmittedRef = useRef(onSubmitted);

  const [pendingCount, setPendingCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const [sessionLost, setSessionLost] = useState(false);

  const getQueue = useCallback((): SaveQueue => {
    if (!queueRef.current) queueRef.current = openOwnedQueue(getStorage(), courseCode, sessionId);
    return queueRef.current;
  }, [courseCode, sessionId]);

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const flush = useCallback((): Promise<void> => {
    if (stoppedRef.current) return Promise.resolve();
    if (flushPromiseRef.current) {
      // 전송 중에 새 항목이 들어왔다. 끝난 뒤 한 번 더 확인한다.
      rerunRef.current = true;
      return flushPromiseRef.current;
    }

    const run = async () => {
      clearRetry();
      const queue = getQueue();
      let failedNow = false;

      do {
        rerunRef.current = false;
        for (;;) {
          const item = queue.peekAll()[0];
          if (!item) break;

          const outcome = await send(courseCode, item);
          if (outcome === "ok" || outcome === "drop") {
            // 전송 중에 같은 항목이 다른 값으로 바뀌었다면 새 값은 큐에 남긴다.
            queue.remove(item.itemId, item.value);
            setPendingCount(queue.size());
            continue;
          }
          if (outcome === "lost") {
            stoppedRef.current = true;
            setFailed(false);
            setSessionLost(true);
            return;
          }
          if (outcome === "submitted") {
            // 이미 제출된 세션이라 이 항목은 다시 보낼 필요가 없다. 큐에서 제거하고 멈춘다.
            queue.remove(item.itemId, item.value);
            setPendingCount(queue.size());
            stoppedRef.current = true;
            onSubmittedRef.current();
            return;
          }
          failedNow = true;
          break;
        }
      } while (rerunRef.current && !failedNow);

      setFailed(failedNow);
      if (failedNow) {
        retryTimerRef.current = setTimeout(() => {
          void flushRef.current();
        }, RETRY_DELAY_MS);
      }
    };

    const promise = run().finally(() => {
      flushPromiseRef.current = null;
    });
    flushPromiseRef.current = promise;
    return promise;
  }, [courseCode, getQueue, clearRetry]);

  useEffect(() => {
    flushRef.current = flush;
    onRestoreRef.current = onRestore;
    onSubmittedRef.current = onSubmitted;
  });

  // 페이지를 열 때 큐에 남은 항목이 있으면 먼저 전송한다.
  useEffect(() => {
    const queue = getQueue();
    const pending = queue.peekAll();
    if (pending.length > 0) {
      onRestoreRef.current(pending);
      setPendingCount(pending.length);
      void flushRef.current();
    }

    const onOnline = () => void flushRef.current();
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      clearRetry();
    };
  }, [getQueue, clearRetry]);

  const enqueue = useCallback(
    (itemId: string, value: boolean) => {
      const queue = getQueue();
      queue.enqueue(itemId, value);
      setPendingCount(queue.size());
      void flush();
    },
    [getQueue, flush],
  );

  const enqueueStep = useCallback(
    (step: string) => {
      const queue = getQueue();
      queue.enqueueStep(step);
      setPendingCount(queue.size());
      void flush();
    },
    [getQueue, flush],
  );

  /** 지금 큐에 남아 있는 항목 수 (flush 를 기다린 뒤 확인할 때 쓴다). */
  const pendingSize = useCallback(() => getQueue().size(), [getQueue]);

  return { enqueue, enqueueStep, flush, pendingSize, pendingCount, failed, sessionLost };
}

"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./CustomerNavigation.module.css";

const ENDED_KEY = "jd_session_ended";
const LOGOUT_ERROR = "이용을 종료하지 못했어요. 연결을 확인하고 이용 종료를 다시 눌러 주세요.";

type Props = {
  onPrevious?: () => void;
  beforeLeave?: () => Promise<void>;
  cancelAdvance?: () => void;
  canEnd?: boolean;
  submitted?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

/** 홈 이동은 세션을 유지한다. 이용 종료만 기존 로그아웃 API를 호출한다. */
export function CustomerNavigation({ onPrevious, beforeLeave, cancelAdvance, canEnd = false, submitted = false, disabled = false, onBusyChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    // 브라우저가 종료 전 문서를 복원하면 서버에서 인증을 다시 확인한다.
    const onPageShow = (event: PageTransitionEvent) => {
      if (canEnd && event.persisted) window.location.reload();
    };
    const onStorage = (event: StorageEvent) => {
      if (canEnd && event.key === ENDED_KEY) window.location.replace("/");
    };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("storage", onStorage);
    };
  }, [canEnd]);

  async function leave(end: boolean) {
    if (busyRef.current || disabled) return;
    busyRef.current = true;
    cancelAdvance?.();
    setBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      await beforeLeave?.();
      if (end) {
        const response = await fetch("/api/session/logout", { method: "POST" }).catch(() => {
          throw new Error(LOGOUT_ERROR);
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.ok !== true) throw new Error(LOGOUT_ERROR);
        try { window.localStorage.setItem(ENDED_KEY, String(Date.now())); } catch { /* 저장소가 막혀도 서버 토큰은 무효화된다. */ }
      }
      // 문서 전체를 이동해 이전 고객의 Next 클라이언트 캐시도 비운다.
      window.location.replace("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "연결을 확인하고 다시 시도해 주세요.");
      busyRef.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <nav className={styles.navigation} aria-label={submitted ? "결과 이동" : "진단 이동"}>
        {!submitted && <button type="button" disabled={busy || disabled || confirming} onClick={() => {
          cancelAdvance?.();
          if (onPrevious) onPrevious();
          else void leave(false);
        }}>← 이전</button>}
        <div className={styles.right}>
          {canEnd && <button type="button" disabled={busy || disabled} onClick={() => { cancelAdvance?.(); setConfirming(true); }}>이용 종료</button>}
          <button type="button" disabled={busy || disabled || confirming} onClick={() => void leave(false)}>{submitted ? "홈으로" : "홈"}</button>
        </div>
      </nav>
      {confirming && <div className={styles.notice} role="group" aria-label="이용 종료 확인">
        <p>{submitted
          ? "이용을 종료하면 진단 결과를 다시 확인할 수 없습니다. 결과를 충분히 확인한 뒤 종료해 주세요."
          : "응답을 저장한 뒤 이용을 종료해요. 같은 정보로 다시 시작하면 이어서 진행할 수 있어요."}</p>
        <div className={styles.actions}>
          <button type="button" disabled={busy || disabled} onClick={() => void leave(true)}>저장하고 이용 종료</button>
          <button type="button" disabled={busy || disabled} onClick={() => { setConfirming(false); setError(null); }}>계속 이용하기</button>
        </div>
      </div>}
      {busy && <p role="status">{confirming ? "저장하고 이용을 종료하는 중…" : "저장 상태 확인 중…"}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  );
}

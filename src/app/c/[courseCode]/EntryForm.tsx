"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isEntryReady } from "@/lib/session/entryForm";
import { CustomerNavigation } from "@/app/CustomerNavigation";
import styles from "./EntryForm.module.css";

const NETWORK_ERROR = "연결에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.";

export function EntryForm({ courseCode }: { courseCode: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nicknameRef = useRef<HTMLInputElement | null>(null);
  const phoneRef = useRef<HTMLInputElement | null>(null);
  const consentRef = useRef<HTMLInputElement | null>(null);

  // 버튼 활성 조건은 isEntryReady 하나로만 정한다 (서버 규칙과 같은 판단).
  const canSubmit = isEntryReady(nickname, phoneLast4, consent) && !submitting;

  // 모바일 자동완성은 onChange를 거치지 않을 수 있어 입력칸의 실제 값도 동기화한다.
  function syncInputValues() {
    const domNickname = nicknameRef.current?.value ?? "";
    const domPhone = phoneRef.current?.value ?? "";
    const domConsent = consentRef.current?.checked ?? false;
    setNickname(domNickname);
    setPhoneLast4(domPhone.replace(/[^0-9]/g, ""));
    setConsent(domConsent);
  }

  useEffect(syncInputValues, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !isEntryReady(nickname, phoneLast4, consent)) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/session/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseCode, nickname, phoneLast4, consent }),
      });
      const data = await response.json().catch(() => null);

      if (response.ok && typeof data?.next === "string") {
        router.replace(data.next);
        return;
      }
      setError(data?.error?.message ?? NETWORK_ERROR);
    } catch {
      setError(NETWORK_ERROR);
    }
    setSubmitting(false);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} onInput={syncInputValues} onBlur={syncInputValues}>
      <CustomerNavigation disabled={submitting} />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="nickname">
          성명
        </label>
        <span className={styles.hint} id="nickname-hint">
          2~10자, 한글·영문·숫자만 쓸 수 있어요
        </span>
        <input
          id="nickname"
          ref={nicknameRef}
          className={styles.input}
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          enterKeyHint="next"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              phoneRef.current?.focus();
            }
          }}
          maxLength={30}
          aria-describedby="nickname-hint"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="phoneLast4">
          휴대폰 뒷자리 4자리
        </label>
        <input
          id="phoneLast4"
          ref={phoneRef}
          className={styles.input}
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              consentRef.current?.focus();
            }
          }}
          pattern="[0-9]*"
          maxLength={4}
          value={phoneLast4}
          onChange={(e) => setPhoneLast4(e.target.value.replace(/[^0-9]/g, ""))}
          autoComplete="off"
        />
      </div>

      <div className={styles.notice}>
        <p className={styles.noticeTitle}>개인정보 수집 안내</p>
        <p className={styles.noticeItem}><span className={styles.noticeLabel}>수집 목적:</span>{" "}검사 결과를 보여드리고, 강사님이 확인하기 위해 사용해요.</p>
        <p className={styles.noticeItem}><span className={styles.noticeLabel}>보관 내용:</span>{" "}성명, 휴대폰 뒷자리(숫자는 저장하지 않고 변환한 값만 저장), 검사 응답, 검사 결과</p>
        <p className={styles.noticeItem}><span className={styles.noticeLabel}>보관 기간:</span>{" "}현재는 계속 보관해요.</p>
      </div>

      <label className={styles.consent}>
        <input
          className={styles.checkbox}
          type="checkbox"
          ref={consentRef}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        개인정보 수집에 동의합니다
      </label>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <button className={styles.button} type="submit" disabled={!canSubmit}>
        {submitting ? "확인하는 중…" : "시작하기"}
      </button>
    </form>
  );
}

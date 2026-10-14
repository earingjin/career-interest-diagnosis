"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./EntryForm.module.css";

const NETWORK_ERROR = "연결에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.";

export function EntryForm({ courseCode }: { courseCode: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 서버가 NFC 정규화 후 검증하므로 길이도 같은 기준으로 센다. 나머지 규칙은 서버가 판단한다.
  const nicknameReady = nickname.normalize("NFC").trim().length >= 2;
  const canSubmit = nicknameReady && /^[0-9]{4}$/.test(phoneLast4) && consent && !submitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

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
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="nickname">
          닉네임
        </label>
        <span className={styles.hint} id="nickname-hint">
          2~10자, 한글·영문·숫자만 쓸 수 있어요
        </span>
        <input
          id="nickname"
          className={styles.input}
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
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
          className={styles.input}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={phoneLast4}
          onChange={(e) => setPhoneLast4(e.target.value.replace(/[^0-9]/g, ""))}
          autoComplete="off"
        />
      </div>

      <div className={styles.notice}>
        <p className={styles.noticeTitle}>개인정보 수집 안내</p>
        <p>수집 목적: 검사 결과를 보여드리고, 강사님이 확인하기 위해 사용해요.</p>
        <p>보관 내용: 닉네임, 휴대폰 뒷자리(숫자는 저장하지 않고 변환한 값만 저장), 검사 응답, 검사 결과</p>
        <p>보관 기간: 현재는 계속 보관해요.</p>
      </div>

      <label className={styles.consent}>
        <input
          className={styles.checkbox}
          type="checkbox"
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

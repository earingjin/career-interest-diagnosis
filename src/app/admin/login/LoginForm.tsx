"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "../admin.module.css";

const NETWORK_ERROR = "연결에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.";

export function LoginForm() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && typeof data?.next === "string") {
        router.replace(data.next);
        router.refresh();
        return;
      }
      setError(data?.error?.message ?? NETWORK_ERROR);
    } catch {
      setError(NETWORK_ERROR);
    }
    setPassword("");
    setSubmitting(false);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="admin-id">
          관리자 ID
        </label>
        <input
          id="admin-id"
          className={styles.input}
          type="text"
          value={id}
          onChange={(e) => setId(e.target.value)}
          autoComplete="username"
          autoCapitalize="off"
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="admin-password">
          비밀번호
        </label>
        <input
          id="admin-password"
          className={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button className={styles.button} type="submit" disabled={submitting || id === "" || password === ""}>
        {submitting ? "확인하는 중…" : "로그인"}
      </button>
    </form>
  );
}

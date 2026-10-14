"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./admin.module.css";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout failed");
      router.replace("/admin/login");
      router.refresh();
    } catch {
      setError("로그아웃하지 못했어요. 다시 시도해 주세요.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={logout} disabled={busy}>
        로그아웃
      </button>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}

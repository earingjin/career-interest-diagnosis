import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import styles from "./admin.module.css";
import { LogoutButton } from "./LogoutButton";

async function AdminHome() {
  await requireAdmin();
  return (
    <>
      <p className={styles.muted}>진단을 완료한 고객을 날짜별로 확인할 수 있습니다.</p>
      <div className={styles.actions}>
        <Link className={styles.link} href="/admin/results">
          결과 관리로 이동
        </Link>
        <LogoutButton />
      </div>
    </>
  );
}

export default function AdminPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>관리자</h1>
      <Suspense fallback={<p className={styles.muted}>불러오는 중…</p>}>
        <AdminHome />
      </Suspense>
    </main>
  );
}

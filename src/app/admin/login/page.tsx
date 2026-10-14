import { Suspense } from "react";
import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin/guard";
import styles from "../admin.module.css";
import { LoginForm } from "./LoginForm";

async function LoginContent() {
  // 이미 로그인되어 있으면 관리자 화면으로 보낸다.
  if (await isAdminAuthenticated()) redirect("/admin");
  return <LoginForm />;
}

export default function AdminLoginPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>관리자 로그인</h1>
      <Suspense fallback={<p className={styles.muted}>불러오는 중…</p>}>
        <LoginContent />
      </Suspense>
    </main>
  );
}

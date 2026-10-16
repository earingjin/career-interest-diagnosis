import { Suspense } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { loadAdminResults } from "@/lib/admin/results";
import { AdminListInputError, formatSeoulTime, seoulToday } from "@/lib/admin/date";
import { unstable_rethrow } from "next/navigation";
import styles from "../admin.module.css";
import { LogoutButton } from "../LogoutButton";

const TYPE_NAMES = { R: "현실형", I: "탐구형", A: "예술형", S: "사회형", E: "진취형", C: "관습형" };

function pageHref(date: string, direction?: "after" | "before", cursor?: string) {
  const params = new URLSearchParams({ date });
  if (direction && cursor) params.set(direction, cursor);
  return `/admin/results?${params}`;
}

async function ResultsContent({ searchParams }: PageProps<"/admin/results">) {
  // redirect 예외를 목록 오류 처리로 삼키지 않는다.
  await requireAdmin();
  const params = await searchParams;
  let list: Awaited<ReturnType<typeof loadAdminResults>> | null = null;
  let message: string | null = null;
  try {
    list = await loadAdminResults(params);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AdminListInputError) message = error.message;
    else {
      console.error("[admin/results]", error instanceof Error ? error.message : "조회 실패");
      message = "목록을 불러오지 못했어요. 잠시 후 다시 조회해 주세요.";
    }
  }
  const date = list?.date ?? (typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : seoulToday());
  return (
    <>
      <form className={styles.dateForm} action="/admin/results" method="get">
        <div className={styles.field}>
          <label className={styles.label} htmlFor="result-date">완료 날짜 (한국 시간)</label>
          <input className={styles.input} id="result-date" name="date" type="date" defaultValue={date} required />
        </div>
        <button className={styles.button} type="submit">조회</button>
      </form>
      {message && <p className={styles.error} role="alert">{message}</p>}
      {list && <>
        <p className={styles.muted}>{list.date} 완료 고객 · 완료시각 최신순 · 한 번에 최대 50명</p>
        {list.items.length === 0 ? <p role="status" className={styles.muted}>
          {params.after || params.before ? "이 페이지에 고객이 없습니다. 날짜를 다시 조회해 주세요." : "해당 날짜에 진단을 완료한 고객이 없습니다."}
        </p> : <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.caption}>진단 완료 고객 목록</caption>
            <thead><tr><th scope="col">성명</th><th scope="col">과정명</th><th scope="col">완료시각</th><th scope="col">1순위</th><th scope="col">2순위</th><th scope="col">상태</th></tr></thead>
            <tbody>{list.items.map((item) => <tr key={item.id}>
              <td>
                <Link prefetch={false} className={styles.rowLink} href={`/admin/results/${item.id}`}>
                  {item.nickname}
                </Link>
              </td><td>{item.courseName}</td>
              <td><time dateTime={item.submittedAt}>{formatSeoulTime(item.submittedAt)}</time></td>
              <td>{item.top1 ? `${item.top1} · ${TYPE_NAMES[item.top1]}` : "—"}</td>
              <td>{item.top2 ? `${item.top2} · ${TYPE_NAMES[item.top2]}` : "—"}</td>
              <td className={item.error ? styles.errorText : undefined}>{item.error ?? "완료"}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <nav className={styles.actions} aria-label="목록 페이지 이동">
          {list.previous && <Link prefetch={false} className={`${styles.link} ${styles.secondary}`} href={pageHref(date, "before", list.previous)}>이전</Link>}
          {(params.after || params.before) && <Link prefetch={false} className={`${styles.link} ${styles.secondary}`} href={pageHref(date)}>첫 페이지</Link>}
          {list.next && <Link prefetch={false} className={styles.link} href={pageHref(date, "after", list.next)}>다음</Link>}
        </nav>
      </>}
      <div className={styles.actions}>
        <Link className={`${styles.link} ${styles.secondary}`} href="/admin">
          관리자 홈
        </Link>
        <LogoutButton />
      </div>
    </>
  );
}

export default function AdminResultsPage(props: PageProps<"/admin/results">) {
  return (
    <main className={`${styles.main} ${styles.resultsMain}`}>
      <h1 className={styles.title}>결과 관리</h1>
      <Suspense fallback={<p className={styles.muted}>불러오는 중…</p>}>
        <ResultsContent {...props} />
      </Suspense>
    </main>
  );
}

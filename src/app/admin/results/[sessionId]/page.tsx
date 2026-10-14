import { Suspense } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { seoulToday } from "@/lib/admin/date";
import { requireAdmin } from "@/lib/admin/guard";
import { loadAdminResultDetail, type AdminResultDetailOutcome } from "@/lib/admin/resultDetail";
import adminStyles from "../../admin.module.css";
import { AdminResultSheet } from "./AdminResultSheet";
import styles from "./detail.module.css";

const MESSAGES: Record<Exclude<AdminResultDetailOutcome["kind"], "ok">, string> = {
  invalid_id: "고객 식별 주소가 올바르지 않아요. 목록에서 고객을 다시 선택해 주세요.",
  not_found: "해당 고객을 찾을 수 없어요. 삭제되었거나 주소가 잘못되었을 수 있어요.",
  in_progress: "아직 진단을 완료하지 않은 고객이에요. 완료한 뒤에 결과를 볼 수 있어요.",
  missing_result: "진단은 완료되었지만 저장된 결과가 없어요. 확인이 필요해요.",
  invalid_result: "저장된 결과 데이터가 올바르지 않아요. 확인이 필요해요.",
};

function Notice({ message }: { message: string }) {
  return (
    <main className={styles.noticeMain}>
      <h1 className={adminStyles.title}>결과 상세</h1>
      <p role="alert" className={adminStyles.error}>
        {message}
      </p>
      <div className={adminStyles.actions}>
        <Link className={`${adminStyles.link} ${adminStyles.secondary}`} href="/admin/results">
          ← 목록으로
        </Link>
      </div>
    </main>
  );
}

async function ResultDetail({ params }: { params: PageProps<"/admin/results/[sessionId]">["params"] }) {
  // 인증을 가장 먼저 확인한다. 인증이 없으면 redirect 로 여기서 끝나 DB 는 조회하지 않는다.
  await requireAdmin();
  const { sessionId } = await params;

  let outcome: AdminResultDetailOutcome;
  try {
    outcome = await loadAdminResultDetail(sessionId);
  } catch (error) {
    unstable_rethrow(error); // redirect 등 Next 내부 예외는 오류 안내로 삼키지 않는다.
    console.error("[admin/result detail]", error instanceof Error ? error.message : "조회 실패");
    return <Notice message="결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />;
  }

  if (outcome.kind !== "ok") return <Notice message={MESSAGES[outcome.kind]} />;

  // 목록으로 돌아갈 때 이 고객이 완료한 날짜(한국 시간)의 목록을 보여준다.
  const date = seoulToday(new Date(outcome.view.submittedAt));
  return <AdminResultSheet view={outcome.view} listHref={`/admin/results?date=${date}`} />;
}

export default function AdminResultDetailPage(props: PageProps<"/admin/results/[sessionId]">) {
  return (
    <Suspense fallback={<p className={adminStyles.muted}>불러오는 중…</p>}>
      <ResultDetail params={props.params} />
    </Suspense>
  );
}

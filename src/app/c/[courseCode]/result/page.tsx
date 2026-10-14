import { Suspense } from "react";
import { redirect } from "next/navigation";
import { loadResult, type LoadResultOutcome } from "@/lib/result/load";
import { ResultClient } from "./ResultClient";

function Notice({ children }: { children: string }) {
  return (
    <main className="page">
      <p className="message">{children}</p>
    </main>
  );
}

async function ResultContent({ params }: { params: PageProps<"/c/[courseCode]/result">["params"] }) {
  const { courseCode } = await params;
  const entryPath = `/c/${encodeURIComponent(courseCode)}`;

  // redirect 는 throw 로 동작하므로 try/catch 밖에서 호출한다.
  let outcome: LoadResultOutcome;
  try {
    outcome = await loadResult(courseCode);
  } catch (error) {
    console.error("[result page]", error instanceof Error ? error.message : error);
    return <Notice>결과를 불러오지 못했어요. 잠시 후 다시 접속해 주세요.</Notice>;
  }

  if (outcome.kind === "no_session") redirect(entryPath);
  if (outcome.kind === "in_progress") redirect(`${entryPath}/test`);

  // 결과 데이터는 이 페이지로만 전달한다 (별도 JSON API 없음).
  return <ResultClient view={outcome.view} />;
}

export default function ResultPage(props: PageProps<"/c/[courseCode]/result">) {
  return (
    <Suspense fallback={<Notice>불러오는 중…</Notice>}>
      <ResultContent params={props.params} />
    </Suspense>
  );
}

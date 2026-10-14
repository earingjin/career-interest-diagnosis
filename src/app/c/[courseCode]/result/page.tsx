import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentSessionForCourse } from "@/lib/session/db";

async function ResultPlaceholder({ params }: { params: PageProps<"/c/[courseCode]/result">["params"] }) {
  const { courseCode } = await params;

  const session = await getCurrentSessionForCourse(courseCode);
  if (!session || session.status !== "submitted") redirect(`/c/${encodeURIComponent(courseCode)}`);

  return <p className="message">결과 화면은 7단계에서 만듭니다</p>;
}

export default function ResultPage(props: PageProps<"/c/[courseCode]/result">) {
  return (
    <main className="page">
      <Suspense fallback={<p className="message">불러오는 중…</p>}>
        <ResultPlaceholder params={props.params} />
      </Suspense>
    </main>
  );
}

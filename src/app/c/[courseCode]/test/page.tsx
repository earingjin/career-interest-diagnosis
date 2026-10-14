import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentSessionForCourse } from "@/lib/session/db";

async function TestPlaceholder({ params }: { params: PageProps<"/c/[courseCode]/test">["params"] }) {
  const { courseCode } = await params;
  const entryPath = `/c/${encodeURIComponent(courseCode)}`;

  const session = await getCurrentSessionForCourse(courseCode);
  if (!session) redirect(entryPath);
  if (session.status === "submitted") redirect(`${entryPath}/result`);

  return (
    <>
      <p className="message">검사 화면은 5단계에서 만듭니다</p>
      <p className="label">현재 step: {session.currentStep}</p>
    </>
  );
}

export default function TestPage(props: PageProps<"/c/[courseCode]/test">) {
  return (
    <main className="page">
      <Suspense fallback={<p className="message">불러오는 중…</p>}>
        <TestPlaceholder params={props.params} />
      </Suspense>
    </main>
  );
}

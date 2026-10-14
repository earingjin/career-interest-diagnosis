import { Suspense } from "react";
import { redirect } from "next/navigation";
import questions from "@/content/questions.json";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentSessionForCourse, type CurrentSession } from "@/lib/session/db";
import { resolveResumeStep } from "@/lib/session/progress";
import { getResponsesSnapshot, type ResponsesSnapshot } from "@/lib/session/responses";
import { TestFlow } from "./TestFlow";

// 클라이언트에는 문항 id 와 text 만 넘긴다. 유형(type)은 보내지 않는다.
const generalQuestions = questions.general.map(({ id, text }) => ({ id, text }));
const adjectiveItems = questions.adjectives.map(({ id, text }) => ({ id, text }));

function Notice({ children }: { children: string }) {
  return (
    <main className="page">
      <p className="message">{children}</p>
    </main>
  );
}

async function TestScreen({ params }: { params: PageProps<"/c/[courseCode]/test">["params"] }) {
  const { courseCode } = await params;
  const entryPath = `/c/${encodeURIComponent(courseCode)}`;

  // redirect 는 throw 로 동작하므로 try/catch 밖에서 호출한다.
  let session: CurrentSession | null = null;
  let snapshot: ResponsesSnapshot | null = null;
  try {
    session = await getCurrentSessionForCourse(courseCode);
    if (session && session.status === "in_progress") {
      // 자기 API 를 fetch 하지 않고 GET /api/session/responses 와 같은 서버 함수를 쓴다.
      snapshot = await getResponsesSnapshot(createServerClient(), session.id);
    }
  } catch (error) {
    console.error("[test page]", error instanceof Error ? error.message : error);
    return <Notice>잠시 문제가 생겼어요. 잠시 후 다시 접속해 주세요.</Notice>;
  }

  if (!session) redirect(entryPath);
  if (session.status === "submitted" || !snapshot) redirect(`${entryPath}/result`);

  return (
    <TestFlow
      courseCode={courseCode}
      sessionId={session.id}
      currentStep={resolveResumeStep(session.currentStep, new Set(Object.keys(snapshot.general)))}
      initialGeneral={snapshot.general}
      initialAdjectives={snapshot.adjectives}
      generalQuestions={generalQuestions}
      adjectiveItems={adjectiveItems}
    />
  );
}

export default function TestPage(props: PageProps<"/c/[courseCode]/test">) {
  return (
    <Suspense fallback={<Notice>불러오는 중…</Notice>}>
      <TestScreen params={props.params} />
    </Suspense>
  );
}

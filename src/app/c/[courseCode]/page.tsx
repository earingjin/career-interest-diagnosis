import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { findCourseByCode, getCurrentSessionForCourse, type Course } from "@/lib/session/db";
import { COURSE_CODE_PATTERN } from "@/lib/session/request";
import { EntryForm } from "./EntryForm";

const NOT_FOUND_MESSAGE = "과정 정보를 찾을 수 없어요";

type Lookup = { kind: "not_found" } | { kind: "error" } | { kind: "ok"; course: Course };

async function lookupCourse(courseCode: string): Promise<Lookup> {
  if (!COURSE_CODE_PATTERN.test(courseCode)) return { kind: "not_found" };
  try {
    const course = await findCourseByCode(createServerClient(), courseCode);
    return course ? { kind: "ok", course } : { kind: "not_found" };
  } catch (error) {
    console.error("[course page]", error instanceof Error ? error.message : error);
    return { kind: "error" };
  }
}

async function Entry({ params }: { params: PageProps<"/c/[courseCode]">["params"] }) {
  const { courseCode } = await params;

  const lookup = await lookupCourse(courseCode);
  if (lookup.kind === "not_found") {
    return <p className="message">{NOT_FOUND_MESSAGE}</p>;
  }
  if (lookup.kind === "error") {
    return <p className="message">잠시 문제가 생겼어요. 잠시 후 다시 접속해 주세요.</p>;
  }

  // 같은 기기에서 다시 들어오면 입력 없이 바로 이어간다.
  // redirect 는 throw 로 동작하므로 try/catch 밖에서 호출한다.
  let session = null;
  try {
    session = await getCurrentSessionForCourse(courseCode);
  } catch (error) {
    console.error("[course page]", error instanceof Error ? error.message : error);
  }
  if (session) {
    redirect(session.status === "submitted" ? `/c/${courseCode}/result` : `/c/${courseCode}/test`);
  }

  return (
    <>
      <p className="label">직업흥미 진단</p>
      <h1 className="message">{lookup.course.name}</h1>
      <EntryForm courseCode={courseCode} />
    </>
  );
}

export default function CoursePage(props: PageProps<"/c/[courseCode]">) {
  return (
    <main className="page">
      <Suspense fallback={<p className="message">불러오는 중…</p>}>
        <Entry params={props.params} />
      </Suspense>
    </main>
  );
}

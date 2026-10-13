import { Suspense } from "react";

async function CourseCode({
  params,
}: {
  params: PageProps<"/c/[courseCode]">["params"];
}) {
  const { courseCode } = await params;
  return <p className="message">{courseCode}</p>;
}

export default function CoursePage(props: PageProps<"/c/[courseCode]">) {
  return (
    <main className="page">
      <p className="label">과정 코드</p>
      <Suspense fallback={<p className="message">&nbsp;</p>}>
        <CourseCode params={props.params} />
      </Suspense>
    </main>
  );
}

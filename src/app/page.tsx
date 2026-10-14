import { Suspense } from "react";
import type { Metadata } from "next";
import { getDefaultCourse } from "@/lib/course/default";
import { Intro, StartAction } from "./HomeSections";

export const metadata: Metadata = {
  description: "질문에 답하고 나의 직업 흥미 유형과 어울리는 직업을 확인해 보세요.",
};

/**
 * 시작 버튼은 요청 때마다 DB 의 기본 과정을 확인해서 만든다 (캐시하지 않는다).
 * 두 곳의 버튼이 같은 요청 안에서는 한 번의 조회를 공유한다.
 */
async function StartButton({ variant }: { variant: "hero" | "footer" }) {
  return <StartAction state={await getDefaultCourse()} variant={variant} />;
}

export default function Home() {
  return (
    <Intro
      hero={
        <Suspense fallback={<StartAction state={{ kind: "loading" }} variant="hero" />}>
          <StartButton variant="hero" />
        </Suspense>
      }
      footer={
        <Suspense fallback={<StartAction state={{ kind: "loading" }} variant="footer" />}>
          <StartButton variant="footer" />
        </Suspense>
      }
    />
  );
}

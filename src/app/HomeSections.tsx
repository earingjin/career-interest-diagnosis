import Link from "next/link";
import type { DefaultCourseOutcome } from "@/lib/course/default";
import styles from "./home.module.css";

export type StartState = DefaultCourseOutcome | { kind: "loading" };

const NOTICES: Record<"none" | "inactive" | "error", { title: string; body: string }> = {
  none: {
    title: "지금은 진단을 시작할 수 없어요",
    body: "진단 준비가 아직 끝나지 않았어요. 잠시 후 다시 접속해 주세요.",
  },
  inactive: {
    title: "지금은 진단을 진행하고 있지 않아요",
    body: "진행 기간이 아니거나 이미 종료되었을 수 있어요. 안내받은 일정을 확인해 주세요.",
  },
  error: {
    title: "잠시 문제가 생겨 진단을 시작할 수 없어요",
    body: "잠시 후 다시 접속해 주세요. 계속 안 되면 담당자에게 알려 주세요.",
  },
};

/**
 * [직업흥미 진단 시작하기] 영역. 기본 과정이 확인된 경우에만 기존 참여자 입력 화면(/c/{과정 코드})으로 연결하고,
 * 그렇지 않으면 연결하지 않고 이유를 안내한다.
 */
export function StartAction({ state, variant }: { state: StartState; variant: "hero" | "footer" }) {
  const tone = variant === "hero" ? styles.onDark : styles.onLight;

  if (state.kind === "ok") {
    return (
      <Link
        prefetch={false}
        href={`/c/${state.code}`}
        data-start-cta={variant}
        className={`${styles.cta} ${variant === "hero" ? styles.ctaHero : styles.ctaFooter}`}
      >
        직업흥미 진단 시작하기
        <span aria-hidden="true" className={styles.arrow}>
          →
        </span>
      </Link>
    );
  }

  if (state.kind === "loading") {
    return (
      <p data-start-loading="true" className={`${styles.pending} ${tone}`}>
        시작 준비 중…
      </p>
    );
  }

  const notice = NOTICES[state.kind];
  return (
    <div role="status" data-start-notice={state.kind} className={`${styles.notice} ${tone}`}>
      <p className={styles.noticeTitle}>{notice.title}</p>
      <p>{notice.body}</p>
    </div>
  );
}

/** 기본 과정 조회와 시작 동작은 StartAction을 그대로 사용한다. */
export function Intro({ hero, footer }: { hero: React.ReactNode; footer: React.ReactNode }) {
  return (
    <main className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.inner}>
          <p className={styles.eyebrow}>직업흥미 진단</p>
          <h1 id="home-title" className={styles.title}>나에게 맞는 직업 흥미를<br />알아보세요</h1>
          <p className={styles.lead}>질문에 답하고 나의 흥미 유형과 어울리는 직업을 확인해요.</p>
          <div className={styles.action}>{hero}</div>
          <p className={styles.heroNote}>진행 중에는 같은 정보로 이어할 수 있어요.</p>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="about-title">
        <div className={styles.inner}>
          <h2 id="about-title" className={styles.heading}>이런 진단이에요</h2>
          <ul className={styles.notes}>
            <li>일반성향 42개 문항 · 형용사 30개 중 5개 이상 선택</li>
            <li>6가지 흥미 유형 중 나의 1·2순위와 추천직업 제공</li>
            <li>전체 결과를 웹 화면에서 확인</li>
          </ul>
          <details className={styles.details}>
            <summary>진행 방법 · 시작하기 전에</summary>
            <ol className={styles.notes}>
              <li>닉네임과 휴대폰 뒷자리 4자리 입력 후 개인정보 수집에 동의해요.</li>
              <li>평소의 나를 떠올리며 솔직하게 답해 주세요. 답은 자동으로 저장돼요.</li>
              <li>최종 제출 전에 응답을 수정할 수 있어요. 제출 후에는 바꿀 수 없어요.</li>
              <li>결과는 처음 진단한 기기에서 확인할 수 있어요. 이용 종료 후에는 결과를 다시 열 수 없으니 충분히 확인한 뒤 종료해 주세요.</li>
              <li>결과는 직업을 생각해 볼 때 참고하는 자료예요.</li>
            </ol>
          </details>
          <div className={styles.action}>{footer}</div>
        </div>
      </section>
    </main>
  );
}

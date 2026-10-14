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

const TYPES = ["현실형", "탐구형", "예술형", "사회형", "진취형", "관습형"];

/** 시작 버튼 외의 소개 내용. 데이터 조회 없이 항상 같은 내용이다. */
export function Intro({ hero, footer }: { hero: React.ReactNode; footer: React.ReactNode }) {
  return (
    <main className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.inner}>
          <p className={styles.eyebrow}>직업흥미 진단</p>
          <h1 id="home-title" className={styles.title}>
            나에게 맞는 직업 흥미를
            <br />
            알아보세요
          </h1>
          <p className={styles.lead}>
            질문에 답하고 나의 흥미 유형 두 가지를 확인해요. 그 유형에 어울리는 직업도 함께 알려 드려요.
          </p>
          <div className={styles.action}>{hero}</div>
          <p className={styles.heroNote}>
            닉네임과 휴대폰 뒷자리 4자리로 시작해요. 중간에 멈춰도 같은 정보로 다시 들어오면 이어서 할 수 있어요.
          </p>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="about-title">
        <div className={styles.inner}>
          <h2 id="about-title" className={styles.heading}>
            이런 진단이에요
          </h2>
          <ul className={styles.cards}>
            <li className={styles.card}>
              <h3 className={styles.cardTitle}>6가지 흥미 유형</h3>
              <p>{TYPES.join(" · ")} 중에서 나의 1순위와 2순위 유형을 알려 드려요.</p>
            </li>
            <li className={styles.card}>
              <h3 className={styles.cardTitle}>문항 구성</h3>
              <p>일반성향 문항 42개에 예 또는 아니요로 답하고, 나에게 어울리는 형용사를 5개 이상 골라요.</p>
            </li>
            <li className={styles.card}>
              <h3 className={styles.cardTitle}>결과지 제공</h3>
              <p>유형별 해설과 추천직업이 담긴 결과지를 확인하고, PDF 로 저장하거나 A4 로 인쇄할 수 있어요.</p>
            </li>
          </ul>
        </div>
      </section>

      <section className={`${styles.section} ${styles.tinted}`} aria-labelledby="steps-title">
        <div className={styles.inner}>
          <h2 id="steps-title" className={styles.heading}>
            진행 방법
          </h2>
          <ol className={styles.steps}>
            <li>
              <span className={styles.stepNumber} aria-hidden="true">
                1
              </span>
              <div>
                <h3 className={styles.cardTitle}>정보 입력</h3>
                <p>닉네임과 휴대폰 뒷자리 4자리를 입력하고, 개인정보 수집 안내를 확인한 뒤 동의해요.</p>
              </div>
            </li>
            <li>
              <span className={styles.stepNumber} aria-hidden="true">
                2
              </span>
              <div>
                <h3 className={styles.cardTitle}>문항에 답하기</h3>
                <p>일반성향 42문항에 답한 뒤 형용사를 골라요. 답은 문항마다 자동으로 저장돼요.</p>
              </div>
            </li>
            <li>
              <span className={styles.stepNumber} aria-hidden="true">
                3
              </span>
              <div>
                <h3 className={styles.cardTitle}>결과 확인</h3>
                <p>제출하면 바로 결과를 볼 수 있어요. 결과지는 PDF 로 저장할 수 있어요.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="notes-title">
        <div className={styles.inner}>
          <h2 id="notes-title" className={styles.heading}>
            시작하기 전에
          </h2>
          <ul className={styles.notes}>
            <li>정답은 없어요. 평소의 나를 떠올리며 솔직하게 답해 주세요.</li>
            <li>제출하면 응답을 바꿀 수 없어요. 제출 전에 한 번 더 확인할 수 있어요.</li>
            <li>결과는 처음 검사한 휴대폰에서 확인할 수 있어요.</li>
            <li>결과는 직업을 생각해 볼 때 참고하는 자료예요.</li>
          </ul>
          <div className={styles.action}>{footer}</div>
        </div>
      </section>
    </main>
  );
}

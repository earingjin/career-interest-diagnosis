import Image from "next/image";
import type { ResultView } from "@/lib/result/view";
import styles from "./cover.module.css";

type Props = {
  view: Pick<ResultView, "nickname" | "submittedAt">;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

/** 개인정보 보호를 위해 관리자 인쇄물 맨 앞에만 표시하는 독립 A4 표지. */
export function AdminResultCover({ view }: Props) {
  return (
    <section className={styles.cover} data-print-cover="true" aria-label="직업 흥미 검사 개인정보 보호 표지">
      <header className={styles.header}>
        <div className={styles.brand}>
          <svg className={styles.shield} viewBox="0 0 48 56" aria-hidden="true">
            <path d="M24 2 44 10v15c0 13-8.2 23.2-20 29C12.2 48.2 4 38 4 25V10L24 2Z" />
            <path d="m15 27 6 6 12-13" />
          </svg>
          <span>경찰전직지원센터</span>
        </div>
        <Image className={styles.documentLogo} src="/jm-career-logo.png" width={669} height={188} alt="제이엠커리어" />
      </header>

      <main className={styles.content}>
        <Image className={styles.policeLogo} src="/police-logo.png" width={256} height={256} alt="경찰 로고" />
        <p className={styles.kicker}>CAREER INTEREST ASSESSMENT</p>
        <h1>직업 흥미 검사</h1>
        <p className={styles.tagline}>나의 경험과 흥미를 바탕으로 새로운 직업의 가능성을 탐색합니다.</p>
      </main>

      <footer className={styles.footer}>
        <dl className={styles.meta}>
          <div>
            <dt>성명</dt>
            <dd>{view.nickname}</dd>
          </div>
          <div>
            <dt>검사일</dt>
            <dd>{formatDate(view.submittedAt)}</dd>
          </div>
        </dl>
        <p className={styles.privacyNotice}>
          본 문서에는 개인의 직업흥미 진단결과가 포함되어 있습니다. 열람 및 보관 시<br />
          개인정보 보호에 유의해 주시기 바랍니다.
        </p>
        <p className={styles.footerBrand}>경찰전직지원센터 <span>|</span> 제이엠커리어</p>
      </footer>
    </section>
  );
}

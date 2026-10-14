"use client";

import type { ResultTypeSection, ResultView } from "@/lib/result/view";
import { ResultHexagon } from "./ResultHexagon";
import styles from "./result.module.css";

type Props = {
  view: ResultView;
  mode: "mobile" | "print";
  /** mobile 의 [A4 출력] 버튼. 데이터는 props 로만 받고 fetch 하지 않는다. */
  onPrintPreview?: () => void;
};

// 서버와 브라우저가 같은 결과를 내도록 시간대를 고정한다.
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

function rankLabel(view: ResultView, type: string): string {
  if (type === view.top1.type) return "1순위";
  if (type === view.top2.type) return "2순위";
  return "";
}

function GroupList({ section }: { section: ResultTypeSection }) {
  return (
    <div className={styles.groups}>
      {section.groups.map((group) => (
        <section key={group.title} className={styles.group}>
          <h3 className={styles.groupTitle}>{group.title}</h3>
          <dl className={styles.rows}>
            {group.items.map((item) => (
              <div key={item.label} className={styles.row}>
                <dt>{item.label}</dt>
                <dd>{item.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function JobList({ section }: { section: ResultTypeSection }) {
  return (
    <section className={styles.jobs}>
      <h3 className={styles.groupTitle}>추천직업</h3>
      <ol className={styles.jobList}>
        {section.jobs.map((job) => (
          <li key={job}>{job}</li>
        ))}
      </ol>
    </section>
  );
}

/** 1순위는 파란 배경과 진한 테두리, 2순위는 흰 배경과 얇은 테두리 */
function SummaryCard({ section, rank }: { section: ResultTypeSection; rank: 1 | 2 }) {
  return (
    <div className={`${styles.card} ${rank === 1 ? styles.cardFirst : styles.cardSecond}`}>
      <p className={styles.cardRank}>{rank}순위</p>
      <p className={styles.cardName}>{section.nameKo}</p>
      <p className={styles.cardEn}>{section.nameEn}</p>
      <p className={styles.cardSubtitle}>{section.subtitle}</p>
    </div>
  );
}

function MobileScoreTable({ view }: { view: ResultView }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">유형</th>
          <th scope="col">합계</th>
          <th scope="col">일반성향</th>
          <th scope="col">형용사</th>
        </tr>
      </thead>
      <tbody>
        {view.totals.map((row) => (
          <tr
            key={row.type}
            data-score-row={row.type}
            data-emphasized={row.emphasized ? "true" : "false"}
            className={row.emphasized ? styles.rowEmphasized : undefined}
          >
            <th scope="row">
              {row.type} {row.nameKo}
              {row.emphasized && <span className={styles.rankBadge}>{rankLabel(view, row.type)}</span>}
            </th>
            <td>{row.total}점</td>
            <td>{row.general}</td>
            <td>{row.adjective}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A4 에서는 6개 유형을 가로 한 줄로 보여준다. */
function PrintScoreTable({ view }: { view: ResultView }) {
  return (
    <table className={styles.pTable}>
      <thead>
        <tr>
          {view.totals.map((row) => (
            <th
              key={row.type}
              data-score-row={row.type}
              data-emphasized={row.emphasized ? "true" : "false"}
              scope="col"
              className={row.emphasized ? styles.cellEmphasized : undefined}
            >
              {row.type} {row.nameKo}
              {row.emphasized && <span className={styles.pRank}>{rankLabel(view, row.type)}</span>}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {view.totals.map((row) => (
            <td key={row.type} className={row.emphasized ? styles.cellEmphasized : undefined}>
              <strong>{row.total}점</strong>
              <span className={styles.pParts}>
                일반 {row.general} + 형용사 {row.adjective}
              </span>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function MobileLayout({ view, onPrintPreview }: Pick<Props, "view" | "onPrintPreview">) {
  return (
    <article className={styles.mobile}>
      <header className={styles.mHeader}>
        <p className={styles.mCourse}>{view.courseName}</p>
        <h1 className={styles.mTitle}>{view.nickname}님의 검사 결과</h1>
        <p className={styles.mDate}>검사일 {formatDate(view.submittedAt)}</p>
      </header>

      <section className={styles.cards} aria-label="1순위와 2순위 요약">
        <SummaryCard section={view.top1} rank={1} />
        <SummaryCard section={view.top2} rank={2} />
      </section>

      <section className={styles.mSection}>
        <h2 className={styles.mHeading}>유형별 점수 그래프</h2>
        <div className={styles.mHexagon}>
          <ResultHexagon totals={view.totals} />
        </div>
      </section>

      {([view.top1, view.top2] as const).map((section, index) => (
        <section key={section.type} className={styles.mSection}>
          <h2 className={styles.mHeading}>
            {index + 1}순위 · {section.nameKo}
            <span className={styles.mHeadingEn}> ({section.nameEn})</span>
          </h2>
          <GroupList section={section} />
          <JobList section={section} />
        </section>
      ))}

      <section className={styles.mSection}>
        <h2 className={styles.mHeading}>전체 점수표</h2>
        <MobileScoreTable view={view} />
      </section>

      <div className={styles.mFooter}>
        <button type="button" className={styles.printButton} onClick={onPrintPreview}>
          A4 출력
        </button>
      </div>
    </article>
  );
}

function PrintColumn({ section, rank }: { section: ResultTypeSection; rank: 1 | 2 }) {
  return (
    <div className={styles.pColumn}>
      <SummaryCard section={section} rank={rank} />
      <GroupList section={section} />
      <JobList section={section} />
    </div>
  );
}

function PrintLayout({ view }: { view: ResultView }) {
  return (
    <div className={styles.sheet} data-print-sheet="true">
      <header className={styles.pHeader}>
        <div className={styles.pInfo}>
          <h1 className={styles.pTitle}>직업선호도 검사 결과</h1>
          <p>과정명: {view.courseName}</p>
          <p>닉네임: {view.nickname}</p>
          <p>검사일: {formatDate(view.submittedAt)}</p>
        </div>
        <div className={styles.pHexagon}>
          <ResultHexagon totals={view.totals} />
        </div>
      </header>

      <div className={styles.pColumns}>
        <PrintColumn section={view.top1} rank={1} />
        <PrintColumn section={view.top2} rank={2} />
      </div>

      <section className={styles.pScores} aria-label="전체 점수표">
        <PrintScoreTable view={view} />
      </section>

      <footer className={styles.pFooter}>기관명 · 문의처 자리</footer>
    </div>
  );
}

export function ResultScreen({ view, mode, onPrintPreview }: Props) {
  return mode === "mobile" ? (
    <MobileLayout view={view} onPrintPreview={onPrintPreview} />
  ) : (
    <PrintLayout view={view} />
  );
}

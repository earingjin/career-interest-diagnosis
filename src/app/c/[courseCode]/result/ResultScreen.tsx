"use client";

import Link from "next/link";
import type { ResultTypeSection, ResultView } from "@/lib/result/view";
import { ResultHexagon } from "./ResultHexagon";
import styles from "./result.module.css";

type Props = {
  view: ResultView;
  mode: "mobile" | "print";
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
        <section key={group.id} className={styles.group}>
          <h3 className={styles.groupTitle}>{group.title}</h3>
          {group.id === "jobs" && <JobList section={section} />}
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
    <ol className={styles.jobList} aria-label="추천직업">
      {section.jobs.map((job) => (
        <li key={job}>{job}</li>
      ))}
    </ol>
  );
}

/** 1순위는 파란 배경과 진한 테두리, 2순위는 흰 배경과 얇은 테두리 */
function SummaryCard({ section, rank }: { section: ResultTypeSection; rank: 1 | 2 }) {
  return (
    <div className={`${styles.card} ${rank === 1 ? styles.cardFirst : styles.cardSecond}`}>
      <p className={styles.cardRank}>{rank}순위</p>
      <p className={styles.cardName}>{section.nameKo}</p>
      <p className={styles.cardEn}>{section.nameEn}</p>
      <p className={styles.cardKeywords}>{section.keywords}</p>
    </div>
  );
}

/** 1·2순위에 공통인 안내. 모바일과 A4 모두 결과 전체에 한 번만 보여준다. */
function CommonNotes({ view }: { view: ResultView }) {
  return (
    <section className={styles.notes} aria-label="결과를 볼 때 알아 두세요">
      <h2 className={styles.notesTitle}>결과를 볼 때 알아 두세요</h2>
      <ul className={styles.notesList}>
        {view.commonNotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
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

function MobileLayout({ view }: Pick<Props, "view">) {
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
        </section>
      ))}

      <section className={styles.mSection}>
        <h2 className={styles.mHeading}>전체 점수표</h2>
        <MobileScoreTable view={view} />
      </section>

      <CommonNotes view={view} />

      <div className={styles.mFooter}>
        <Link href="/" className={styles.backButton}>홈으로</Link>
      </div>
    </article>
  );
}

function PrintColumn({ section, rank }: { section: ResultTypeSection; rank: 1 | 2 }) {
  return (
    <div className={styles.pColumn}>
      <SummaryCard section={section} rank={rank} />
      <GroupList section={section} />
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

      <CommonNotes view={view} />

      <footer className={styles.pFooter}>기관명 · 문의처 자리</footer>
    </div>
  );
}

export function ResultScreen({ view, mode }: Props) {
  return mode === "mobile" ? (
    <MobileLayout view={view} />
  ) : (
    <PrintLayout view={view} />
  );
}

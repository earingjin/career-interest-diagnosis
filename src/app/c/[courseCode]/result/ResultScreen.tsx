"use client";

import Link from "next/link";
import type { ResultTypeSection, ResultView } from "@/lib/result/view";
import { ResultHexagon } from "./ResultHexagon";
import styles from "./result.module.css";

type Props = {
  view: ResultView;
  mode: "mobile" | "print";
};

const PAGE_COUNT = 2;
const MAX_SCORE = 12; // 유형별 일반성향 7문항 + 형용사 5개
const FOOTER_TEXT = "기관명 · 문의처 자리";

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

function totalOf(view: ResultView, type: string): number {
  return view.totals.find((row) => row.type === type)?.total ?? 0;
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

/** 상세 해설의 유형 머리말. 1순위는 파란 배경과 진한 테두리, 2순위는 흰 배경과 얇은 테두리 */
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

/** 1·2순위 유형명과 점수 */
function RankSummary({ view }: { view: ResultView }) {
  return (
    <section className={styles.ranks} aria-label="1순위와 2순위 요약">
      {([view.top1, view.top2] as const).map((section, index) => (
        <div key={section.type} className={`${styles.rank} ${index === 0 ? styles.cardFirst : styles.cardSecond}`}>
          <p className={styles.cardRank}>{index + 1}순위</p>
          <p className={styles.rankName}>
            {section.nameKo}
            <span className={styles.rankEn}> {section.nameEn}</span>
          </p>
          <p className={styles.rankScore}>{totalOf(view, section.type)}점</p>
        </div>
      ))}
    </section>
  );
}

/** 1·2순위 조합의 종합 해석 세 문장. 하나의 영역 안에서 항목명으로 구분한다. */
function CombinedInterpretation({ view }: { view: ResultView }) {
  const { summary, explanation, exploration } = view.combinedInterpretation;
  return (
    <section className={styles.combined} aria-label="나의 직업흥미 종합 해석">
      <h2 className={styles.combinedTitle}>나의 직업흥미 종합 해석</h2>
      <dl className={styles.combinedRows}>
        <div className={styles.combinedSummary}>
          <dt>핵심 요약</dt>
          <dd>{summary}</dd>
        </div>
        <div>
          <dt>종합 설명</dt>
          <dd>{explanation}</dd>
        </div>
        <div>
          <dt>탐색 제안</dt>
          <dd>{exploration}</dd>
        </div>
      </dl>
    </section>
  );
}

/** 1·2순위 조합의 상세 해석 세 항목. 모바일은 종합 해석 바로 아래, A4 는 2페이지 아래쪽에 같은 문안으로 둔다. */
function CombinedDetail({ view }: { view: ResultView }) {
  const { together, connect, balance } = view.combinedDetail;
  return (
    <section className={styles.detail} aria-label="나의 직업흥미 상세 해석">
      <h2 className={styles.detailTitle}>
        나의 직업흥미 상세 해석
        <span className={styles.detailPair}>(1순위 {view.top1.nameKo} + 2순위 {view.top2.nameKo})</span>
      </h2>
      <dl className={styles.detailRows}>
        <div>
          <dt>두 흥미가 만나면</dt>
          <dd>{together}</dd>
        </div>
        <div>
          <dt>경험에 연결해 보기</dt>
          <dd>{connect}</dd>
        </div>
        <div>
          <dt>균형 있게 살펴볼 점</dt>
          <dd>{balance}</dd>
        </div>
      </dl>
    </section>
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

/**
 * A4 에서는 6개 유형을 점수가 높은 순(같으면 RIASEC 순서)의 가로 막대 6줄로 보여준다.
 * 1·2순위는 색만이 아니라 진한 막대, 굵은 글씨, "1순위/2순위" 글자로 구분해 흑백 인쇄에서도 알아볼 수 있게 한다.
 */
function PrintScoreBars({ view }: { view: ResultView }) {
  const rows = [...view.totals].sort((a, b) => b.total - a.total);
  return (
    <section className={styles.pScores} aria-label="전체 점수표">
      <h2 className={styles.pSectionTitle}>
        유형별 점수 <span className={styles.pSectionNote}>(만점 {MAX_SCORE}점 · 일반 + 형용사)</span>
      </h2>
      <ol className={styles.pBars}>
        {rows.map((row) => {
          const rank = rankLabel(view, row.type);
          return (
            <li
              key={row.type}
              data-score-row={row.type}
              data-emphasized={row.emphasized ? "true" : "false"}
              className={`${styles.pBar} ${row.emphasized ? styles.pBarEmphasized : ""}`}
            >
              <span className={styles.pBarName}>
                {row.type} {row.nameKo}
                {rank && <span className={`${styles.pRank} ${rank === "1순위" ? styles.pRankFirst : styles.pRankSecond}`}>{rank}</span>}
              </span>
              <span className={styles.pBarTrack} aria-hidden="true">
                <span className={styles.pBarFill} style={{ width: `${(Math.min(row.total, MAX_SCORE) / MAX_SCORE) * 100}%` }} />
              </span>
              <strong className={styles.pBarScore}>{row.total}점</strong>
              <span className={styles.pParts}>
                일반 {row.general} + 형용사 {row.adjective}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** 모바일: A4 를 축소하지 않고 세로 스크롤로 보여준다. */
function MobileLayout({ view }: Pick<Props, "view">) {
  return (
    <article className={styles.mobile}>
      <header className={styles.mHeader}>
        <h1 className={styles.mTitle}>{view.nickname}님의 검사 결과</h1>
        <p className={styles.mDate}>검사일 {formatDate(view.submittedAt)}</p>
      </header>

      <section className={styles.mSection}>
        <h2 className={styles.mHeading}>유형별 점수 그래프</h2>
        <div className={styles.mHexagon}>
          <ResultHexagon totals={view.totals} />
        </div>
      </section>

      <RankSummary view={view} />

      <CombinedInterpretation view={view} />

      <CombinedDetail view={view} />

      <details className={styles.scoreDropdown}>
        <summary>
          <span className={styles.mHeading}>전체 점수표</span>
          <span className={styles.scoreDropdownIcon} aria-hidden="true">⌄</span>
        </summary>
        <div className={styles.scoreDropdownContent}>
          <MobileScoreTable view={view} />
        </div>
      </details>

      {([view.top1, view.top2] as const).map((section, index) => (
        <section key={section.type} className={styles.mSection} aria-label={`${index + 1}순위 상세 해설`}>
          <h2 className={styles.mHeading}>{index + 1}순위 상세 해설</h2>
          <SummaryCard section={section} rank={index === 0 ? 1 : 2} />
          <GroupList section={section} />
        </section>
      ))}

      <CommonNotes view={view} />

      <div className={styles.mFooter}>
        <Link href="/" className={styles.backButton}>홈으로</Link>
      </div>
    </article>
  );
}

function PageFooter({ page }: { page: number }) {
  return (
    <footer className={styles.pFooter}>
      <span>{FOOTER_TEXT}</span>
      <span className={styles.pPageNumber}>
        {page} / {PAGE_COUNT}
      </span>
    </footer>
  );
}

/**
 * A4 2페이지의 순위별 가로 띠: 머리줄 → 3열 본문 → 추천직업 줄 → 확인사항 줄.
 * 본문 3열과 확인사항은 view 의 groups 를 그대로 쓴다. "추천직업과 확인사항" 묶음은 아래 두 줄로 나누어 보여준다.
 */
function PrintBand({ section, rank }: { section: ResultTypeSection; rank: 1 | 2 }) {
  const columns = section.groups.filter((group) => group.id !== "jobs");
  const jobsGroup = section.groups.find((group) => group.id === "jobs");
  return (
    <section
      className={`${styles.band} ${rank === 1 ? styles.bandFirst : styles.bandSecond}`}
      aria-label={`${rank}순위 상세 해설`}
    >
      <header className={styles.bandHead}>
        <span className={styles.bandRank}>{rank}순위</span>
        <h3 className={styles.bandName}>
          {section.nameKo}
          <span className={styles.bandEn}>{section.nameEn}</span>
        </h3>
        <p className={styles.bandKeywords}>{section.keywords}</p>
      </header>

      <div className={styles.bandBody}>
        {columns.map((group) => (
          <section key={group.id} className={styles.bandColumn}>
            <h4 className={styles.bandColumnTitle}>{group.title}</h4>
            <dl className={styles.bandItems}>
              {group.items.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>{item.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <div className={styles.bandJobs}>
        <p className={styles.bandRowLabel}>추천직업</p>
        <ol className={styles.chips} aria-label="추천직업">
          {section.jobs.map((job) => (
            <li key={job}>{job}</li>
          ))}
        </ol>
      </div>

      {jobsGroup && (
        <dl className={styles.bandCheck}>
          {jobsGroup.items.map((item) => (
            <div key={item.label}>
              <dt className={styles.bandRowLabel}>{item.label}</dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/**
 * A4 두 장. 1페이지: 결과 점수와 종합 해석, 2페이지: 1·2순위 상세 해설과 조합 상세 해석.
 * 각 페이지는 고정 크기이며 인쇄할 때 1페이지 뒤에서 페이지를 나눈다.
 * 남는 높이는 빈 곳으로 모으지 않고 점수 막대·띠·상세 해석 영역의 높이로 나누어 흡수한다.
 */
function PrintLayout({ view }: { view: ResultView }) {
  return (
    <div className={styles.sheets} data-print-sheet="true">
      <section className={`${styles.sheet} ${styles.page1}`} data-print-page="1" aria-label="1페이지 나의 직업흥미 결과">
        <header className={styles.pHeader}>
          <div>
            <p className={styles.pKicker}>직업흥미 탐색 진단</p>
            <h1 className={styles.pTitle}>나의 직업흥미 결과</h1>
          </div>
          <p className={styles.pInfo}>
            <span>닉네임: {view.nickname}</span>
            <span>검사일: {formatDate(view.submittedAt)}</span>
          </p>
        </header>

        <div className={styles.pOverview}>
          <RankSummary view={view} />
          <div className={styles.pHexagon}>
            <ResultHexagon totals={view.totals} />
          </div>
        </div>

        <CombinedInterpretation view={view} />

        <PrintScoreBars view={view} />

        <CommonNotes view={view} />

        <PageFooter page={1} />
      </section>

      <section className={`${styles.sheet} ${styles.page2}`} data-print-page="2" aria-label="2페이지 나의 직업흥미 상세 해설">
        <header className={styles.pHeader}>
          <h2 className={styles.pTitle}>나의 직업흥미 상세 해설</h2>
          <p className={`${styles.pInfo} ${styles.pInfoInline}`}>
            <span>닉네임: {view.nickname}</span>
            <span>1순위 {view.top1.nameKo} · 2순위 {view.top2.nameKo}</span>
          </p>
        </header>

        <CombinedDetail view={view} />

        <PrintBand section={view.top1} rank={1} />
        <PrintBand section={view.top2} rank={2} />

        <PageFooter page={2} />
      </section>
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

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import combinedDetails from "../../../content/combined-details.json";
import combinedInterpretations from "../../../content/combined-interpretations.json";
import interpretations from "../../../content/interpretations.json";
import { buildResultView } from "../../result/view";
import { classifyHexagon } from "../../result/hexagon";
import { TYPE_DESCRIPTIONS, TYPE_DESCRIPTIONS_TITLE } from "../../result/typeDescriptions";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode; prefetch?: boolean }) => (
    <a href={href}>{children}</a>
  ),
}));

import { AdminResultSheet } from "@/app/admin/results/[sessionId]/AdminResultSheet";
import { ResultScreen } from "@/app/c/[courseCode]/result/ResultScreen";
import { ResultClient } from "@/app/c/[courseCode]/result/ResultClient";

const scores = { R: 0, I: 0, A: 0, S: 7, E: 6, C: 0 };
const view = buildResultView({
  result: {
    scoring_version: "1.0.0",
    general_scores: scores,
    adjective_scores: { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 },
    totals: scores,
    top1: "S",
    top2: "E",
    job_recommendations: [
      { type: "S", jobs: ["가정봉사원", "간병인", "결혼상담원(커플매니저)", "교통지도원", "기숙사 사감"], count: 5 },
      { type: "E", jobs: ["건널목관리원", "검수원", "경비원(건물 관리원)", "공원관리인", "매장감시원"], count: 5 },
    ],
  },
  nickname: "홍길동",
  courseName: "테스트 과정",
  submittedAt: "2026-10-14T03:00:00.000Z",
  interpretations,
  combinedInterpretations,
  combinedDetails,
});

const html = renderToStaticMarkup(<AdminResultSheet view={view} listHref="/admin/results?date=2026-10-14" />);
const [chromePart, sheetPart] = html.split('data-admin-sheet="true"');

const read = (relative: string) => readFileSync(path.join(process.cwd(), relative), "utf8");
const detailCss = read("src/app/admin/results/[sessionId]/detail.module.css");
const resultCss = read("src/app/c/[courseCode]/result/result.module.css");

it("추천직업 일부를 생략한 경우에만 모바일과 A4의 마지막 항목에 등을 붙인다", () => {
  const partial = {
    ...view,
    top1: { ...view.top1, jobs: ["원문 복합·직업명"], jobsTruncated: true },
    top2: { ...view.top2, jobs: ["전체 표시 직업"], jobsTruncated: false },
  };
  for (const mode of ["mobile", "print"] as const) {
    const markup = renderToStaticMarkup(<ResultScreen view={partial} mode={mode} />);
    expect(markup).toContain("원문 복합·직업명 등</li>");
    expect(markup).toContain("전체 표시 직업</li>");
    expect(markup).not.toContain("전체 표시 직업 등");
  }
});

describe("관리자 상세 화면: 인쇄에서 제외되는 UI", () => {
  it("도구 줄(목록 이동·인쇄 버튼·안내)에 인쇄 제외 표식이 있다", () => {
    expect(chromePart).toContain('data-admin-chrome="true"');
    expect(chromePart).toContain("← 목록으로");
    expect(chromePart).toContain(">인쇄</button>");
    expect(chromePart).toContain("머리글 및 바닥글");
    expect(chromePart).toContain('href="/admin/results?date=2026-10-14"');
  });

  it("결과지 영역에는 버튼·링크·입력·검색·메뉴가 하나도 없다", () => {
    expect(sheetPart).toBeTruthy();
    for (const tag of ["<button", "<a ", "<a>", "<input", "<form", "<nav", "<select", "<textarea"]) {
      expect(sheetPart, tag).not.toContain(tag);
    }
  });

  it("버튼과 링크는 모두 도구 줄 안에만 있다", () => {
    const outsideSheet = chromePart;
    expect((outsideSheet.match(/<button/g) ?? []).length).toBe(1);
    expect((html.match(/<button/g) ?? []).length).toBe(1);
    expect((html.match(/<a /g) ?? []).length).toBe(1);
    // 고객 모바일 화면의 [A4 출력] 버튼은 관리자 화면에 없다
    expect(html).not.toContain("A4 출력");
    expect(html).not.toContain("인쇄 / PDF 저장");
  });

  it("인쇄 CSS 가 도구 줄을 숨긴다", () => {
    const printBlock = detailCss.slice(detailCss.indexOf("@media print"));
    expect(printBlock).toMatch(/\.toolbar/);
    expect(printBlock).toContain("[data-admin-chrome]");
    expect(printBlock).toMatch(/display:\s*none\s*!important/);
  });

  it("관리자 화면에는 모바일 결과 레이아웃이 없고 A4 결과지만 있다", () => {
    expect(html).toContain("나의 직업흥미 결과"); // A4 1쪽 제목
    expect(html).toContain('data-print-sheet="true"');
    expect(html).not.toContain("님의 검사 결과"); // 모바일 제목
  });
});

describe("관리자 상세 화면: 공유 A4 결과지 유지", () => {
  it("@page A4 를 이 페이지에 직접 넣는다", () => {
    expect(html).toContain("@page { size: A4; margin: 0; }");
  });

  it("A4 결과지 CSS 는 210mm x 296mm, 넘침 숨김, 배경색 인쇄를 지정한다", () => {
    const sheet = resultCss.slice(resultCss.indexOf(".sheet {"), resultCss.indexOf("}", resultCss.indexOf(".sheet {")));
    expect(sheet).toContain("width: 210mm");
    expect(sheet).toContain("height: 296mm");
    expect(sheet).toContain("overflow: hidden");
    expect(resultCss).toContain("print-color-adjust: exact");
  });

  it("인쇄 때는 미리보기 확대·축소를 해제하고 결과지만 보이게 하는 규칙이 있다", () => {
    const printBlock = resultCss.slice(resultCss.lastIndexOf("@media print"));
    expect(printBlock).toMatch(/\.printArea\s*{[^}]*display:\s*block\s*!important/);
    expect(printBlock).toMatch(/\.previewScale\s*{[^}]*transform:\s*none\s*!important/);
    expect(printBlock).toMatch(/\.previewFrame\s*{[^}]*width:\s*210mm\s*!important/);
  });

  it("A4 결과지 CSS 는 빈 공간을 margin-top:auto 로 한곳에 모으지 않는다", () => {
    const a4 = resultCss.slice(resultCss.indexOf("/* ===== A4 결과지"), resultCss.lastIndexOf("@media print"));
    expect(a4.length).toBeGreaterThan(0);
    expect(a4).not.toMatch(/margin-top:\s*auto/);
  });

  it("인쇄 때 1페이지 뒤에서만 페이지를 나눈다", () => {
    const printBlock = resultCss.slice(resultCss.lastIndexOf("@media print"));
    expect(printBlock).toMatch(/\.sheet\s*{[^}]*break-after:\s*page/);
    expect(printBlock).toMatch(/\.sheet:last-child\s*{[^}]*break-after:\s*avoid/);
  });

  it("결과지는 기존 공유 컴포넌트(mode=print)와 동일한 내용이다", () => {
    const sharedPrint = renderToStaticMarkup(<ResultScreen view={view} mode="print" />);
    expect(html).toContain(sharedPrint);
  });

  it("결과지 머리에는 성명과 검사일만 있고 과정명은 나오지 않는다", () => {
    expect(sheetPart).toContain("성명: 홍길동");
    expect(sheetPart).toContain("검사일: 2026년 10월 14일");
    expect(sheetPart).not.toContain("테스트 과정");
  });

  it("점수·해설·추천직업이 결과지에 모두 나온다", () => {
    for (const text of ["홍길동", "사회형", "진취형", "나의 직업흥미 특성", "경력 활용과 진로 탐색", "가정봉사원", "매장감시원", 'alt="제이엠커리어"']) {
      expect(sheetPart, text).toContain(text);
    }
  });
});

describe("모바일·A4 결과: 같은 해설과 공통 안내", () => {
  const mobile = renderToStaticMarkup(<ResultScreen view={view} mode="mobile" />);
  const print = renderToStaticMarkup(<ResultScreen view={view} mode="print" />);
  const escaped = (text: string) => renderToStaticMarkup(<>{text}</>);
  const count = (markup: string, text: string) => markup.split(`>${escaped(text)}<`).length - 1;
  // 유형 이름은 그래프·점수표·2페이지 머리말에도 나오므로 횟수 비교에서 뺀다.
  // A4 띠는 "추천직업과 확인사항" 묶음 제목 대신 "추천직업" 줄과 "확인사항" 줄로 나누어 보여주므로 그 제목만 따로 확인한다.
  const sectionTexts = [view.top1, view.top2].flatMap((section) => [
    section.keywords, ...section.jobs,
    ...section.groups.flatMap((group) => [...(group.id === "jobs" ? [] : [group.title]), ...group.items.flatMap((item) => [item.label, item.text])]),
  ]);

  const combinedTexts = Object.values(view.combinedInterpretation);
  const detailTexts = Object.values(view.combinedDetail);
  const detailLabels = ["나의 직업흥미 상세 해석", "두 흥미가 만나면", "경험에 연결해 보기", "균형 있게 살펴볼 점"];

  it("유형 해설·키워드·추천직업·확인사항·종합 해석·상세 해석이 두 화면에 같은 횟수로 나온다", () => {
    for (const text of [...sectionTexts, ...combinedTexts, ...detailTexts, ...detailLabels, "나의 직업흥미 종합 해석", "핵심 요약", "종합 설명", "탐색 제안"]) {
      expect(count(mobile, text), text).toBeGreaterThan(0);
      expect(count(print, text), text).toBe(count(mobile, text));
    }
  });

  it("A4 띠는 추천직업 줄과 확인사항 줄로 나누고, 모바일은 기존 묶음 제목을 유지한다", () => {
    expect(count(mobile, "추천직업과 확인사항")).toBe(2);
    expect(count(print, "추천직업과 확인사항")).toBe(0);
    expect(count(print, "추천직업")).toBe(2);
    expect(count(print, "확인사항")).toBe(count(mobile, "확인사항"));
  });

  it("상세 해석 제목에 1·2순위 유형명이 함께 나온다", () => {
    for (const markup of [mobile, print]) expect(markup).toContain(`(1순위 ${view.top1.nameKo} + 2순위 ${view.top2.nameKo})`);
  });

  it("공통 안내는 두 화면 모두 결과 전체에 정확히 한 번 나온다", () => {
    for (const note of view.commonNotes) {
      expect(count(mobile, note), note).toBe(1);
      expect(count(print, note), note).toBe(1);
    }
    expect(count(mobile, "결과를 볼 때 알아 두세요")).toBe(1);
    expect(count(print, "결과를 볼 때 알아 두세요")).toBe(1);
  });

  it("키워드는 유형마다 한 번만 나오고 본문 항목으로 반복되지 않는다", () => {
    for (const section of [view.top1, view.top2]) {
      expect(count(mobile, section.keywords)).toBe(1);
      expect(count(print, section.keywords)).toBe(1);
    }
    expect(mobile).not.toContain(">키워드<");
    expect(print).not.toContain(">키워드<");
  });

  it("A4 공통 안내는 6개 유형 설명 다음, 하단 문구 앞에 있다", () => {
    const scores = print.indexOf(`aria-label="${TYPE_DESCRIPTIONS_TITLE}"`);
    const notes = print.indexOf(escaped(view.commonNotes[0]));
    expect(scores).toBeGreaterThan(-1);
    expect(notes).toBeGreaterThan(scores);
    expect(print.indexOf('alt="제이엠커리어"')).toBeGreaterThan(notes);
  });

  it("두 화면에 개인별 육각 해석 하나와 동일한 유형 설명이 나온다", () => {
    const feedback = classifyHexagon(scores);
    for (const markup of [mobile, print]) {
      expect((markup.match(/data-hexagon-shape=/g) ?? []).length).toBe(1);
      expect(markup).toContain(`data-hexagon-shape="${feedback.key}"`);
      for (const text of [feedback.shape, feedback.description, feedback.exploration, ...Object.values(TYPE_DESCRIPTIONS)]) {
        expect(markup).toContain(escaped(text));
      }
      expect(markup).not.toContain("베타테스트용 잠정 해석입니다");
      expect(markup).not.toContain("형용사 선택 개수에 따라 분류가 달라질 수 있으며");
      expect(markup).not.toContain("심리측정학적 검증을 거치지 않은 기준입니다");
    }
  });

  it("고객·관리자 화면에 특정 연령대 표현이 없다", () => {
    for (const markup of [mobile, print]) expect(markup).not.toMatch(/중장년|장년|고령|시니어|노년|어르신/);
  });
});

describe("고객 결과: 전체 웹 결과만 제공", () => {
  const customerHtml = renderToStaticMarkup(<ResultClient view={view} />);

  it("상위 두 유형의 모든 해석·추천직업과 6개 유형 점수·그래프를 유지한다", () => {
    expect(customerHtml).toContain("홍길동님의 검사 결과");
    expect(customerHtml).toContain("유형별 점수 그래프");
    expect(customerHtml).toContain("<svg");
    expect((customerHtml.match(/data-score-row=/g) ?? []).length).toBe(6);
    for (const row of view.totals) {
      expect(customerHtml).toContain(`data-score-row="${row.type}"`);
      expect(customerHtml).toContain(`>${row.total}점<`);
    }
    for (const section of [view.top1, view.top2]) {
      for (const text of [section.nameKo, ...section.jobs, ...section.groups.flatMap((group) => [group.title, ...group.items.map((item) => item.text)])]) {
        expect(customerHtml).toContain(renderToStaticMarkup(<>{text}</>));
      }
    }
  });

  it("홈·이용 종료는 유지하고 출력 버튼·숨겨진 A4·다운로드 링크·A4 페이지 설정을 제거한다", () => {
    expect(customerHtml).toContain('href="/"');
    expect(customerHtml).toContain("홈으로");
    expect(customerHtml).toContain("이용 종료");
    expect(customerHtml).not.toMatch(/PDF|인쇄|A4|미리보기|@page|data-print-sheet|data-preview|download=/);
  });
});

describe("A4 두 장: 페이지별 내용", () => {
  const print = renderToStaticMarkup(<ResultScreen view={view} mode="print" />);
  const escaped = (text: string) => renderToStaticMarkup(<>{text}</>);
  const [, page1 = "", page2 = ""] = print.split(/data-print-page="\d"/);
  const combinedTexts = Object.values(view.combinedInterpretation);
  const detailTexts = Object.values(view.combinedDetail);

  it("정확히 두 장이고 각 장에 제목과 쪽 번호, 기관명·문의처가 있다", () => {
    expect((print.match(/data-print-page=/g) ?? []).length).toBe(2);
    expect(page1).toContain("직업흥미 탐색 진단");
    expect(page1).toContain("나의 직업흥미 결과");
    expect(page2).toContain("나의 직업흥미 상세 해설");
    expect(page1).toContain(">1 / 2<");
    expect(page2).toContain(">2 / 2<");
    for (const page of [page1, page2]) expect(page).toContain('alt="제이엠커리어"');
  });

  it("1페이지: 그래프·1·2순위 카드·육각 해석·종합 해석·유형 설명·안내 순서", () => {
    const order = [
      "성명: 홍길동", 'aria-label="1순위와 2순위 요약"', "<svg", "나의 흥미육각 모형 해석",
      "나의 직업흥미 종합 해석", `aria-label="${TYPE_DESCRIPTIONS_TITLE}"`, "결과를 볼 때 알아 두세요", 'alt="제이엠커리어"',
    ].map((marker) => page1.indexOf(marker));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const ranks = page1.slice(page1.indexOf('aria-label="1순위와 2순위 요약"'), page1.indexOf('aria-label="나의 흥미육각 모형 해석"'));
    expect(ranks).toContain("사회형");
    expect(ranks).toContain("진취형");
    for (const text of [...combinedTexts, ...view.commonNotes]) expect(page1, text).toContain(escaped(text));
    expect(page1).not.toContain("나의 직업흥미 특성");
    for (const text of detailTexts) expect(page1, text).not.toContain(escaped(text));
  });

  it("1페이지 유형 설명: 6줄, 점수 없이 설명과 기존 1·2순위 강조를 표시한다", () => {
    const rows = [...page1.matchAll(/<li[^>]*data-score-row="([RIASEC])"[^>]*data-emphasized="(true|false)"[^>]*>([\s\S]*?)<\/li>/g)];
    expect(rows.map((m) => m[1]).sort()).toEqual(["A", "C", "E", "I", "R", "S"]);
    for (const [, type, emphasized, body] of rows) {
      const row = view.totals.find((t) => t.type === type)!;
      expect(body, type).toContain(TYPE_DESCRIPTIONS[row.type]);
      expect(body, type).not.toMatch(/\d+점|일반 \d|형용사 \d/);
      expect(emphasized, type).toBe(row.emphasized ? "true" : "false");
      if (type === view.top1.type) expect(body).toContain(">1순위<");
      else if (type === view.top2.type) expect(body).toContain(">2순위<");
      else expect(body, type).not.toMatch(/순위/);
    }
    expect(rows.map((m) => m[1])).toEqual(["R", "I", "A", "S", "E", "C"]);
  });

  it("2페이지: 조합 상세 해석 → 1순위 띠 → 2순위 띠 순서이고 종합 해석·공통 안내를 반복하지 않는다", () => {
    for (const section of [view.top1, view.top2]) {
      const texts = [section.keywords, ...section.jobs, ...section.groups.flatMap((g) => [...(g.id === "jobs" ? [] : [g.title]), ...g.items.map((i) => i.text)])];
      for (const text of texts) expect(page2, text).toContain(escaped(text));
    }
    expect(page2.indexOf(escaped(view.top1.keywords))).toBeLessThan(page2.indexOf(escaped(view.top2.keywords)));
    const order = ['aria-label="나의 직업흥미 상세 해석"', 'aria-label="1순위 상세 해설"', 'aria-label="2순위 상세 해설"', 'alt="제이엠커리어"'].map((m) => page2.indexOf(m));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const text of detailTexts) expect(page2, text).toContain(escaped(text));
    // 추천직업은 기존 순서대로 알약으로 나온다
    for (const section of [view.top1, view.top2]) {
      const positions = section.jobs.map((job) => page2.indexOf(`<li>${escaped(job)}</li>`));
      expect(positions.every((i) => i >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    }
    for (const text of [...combinedTexts, ...view.commonNotes, "나의 직업흥미 종합 해석", "결과를 볼 때 알아 두세요"]) {
      expect(page2, text).not.toContain(escaped(text));
    }
  });
});

describe("모바일 결과: 세로 배치 순서", () => {
  const mobile = renderToStaticMarkup(<ResultScreen view={view} mode="mobile" />);

  it("기본정보 → 그래프 → 1·2순위 요약 → 종합 해석 → 상세 해석 → 점수표(접힘) → 1순위 → 2순위 상세 해설 → 안내", () => {
    const order = [
      "홍길동님의 검사 결과", "유형별 점수 그래프", 'aria-label="1순위와 2순위 요약"', "나의 흥미육각 모형 해석", "나의 직업흥미 종합 해석",
      'aria-label="나의 직업흥미 상세 해석"', "<details", 'aria-label="1순위 상세 해설"', 'aria-label="2순위 상세 해설"', "결과를 볼 때 알아 두세요",
    ].map((marker) => mobile.indexOf(marker));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(mobile).not.toContain("data-print-page");
  });

  it("전체 점수표는 접히는 영역 안에 6개 유형이 모두 있고 공통 안내는 한 번만 나온다", () => {
    const details = mobile.slice(mobile.indexOf("<details"), mobile.indexOf("</details>"));
    expect(details).toContain(`aria-label="${TYPE_DESCRIPTIONS_TITLE}"`);
    expect(details).not.toMatch(/\d+점|>합계<|>일반성향<|>형용사</);
    expect((details.match(/data-score-row=/g) ?? []).length).toBe(6);
    expect(mobile.split(">결과를 볼 때 알아 두세요<").length - 1).toBe(1);
  });
});

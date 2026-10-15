import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import interpretations from "../../../content/interpretations.json";
import { buildResultView } from "../../result/view";

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
});

const html = renderToStaticMarkup(<AdminResultSheet view={view} listHref="/admin/results?date=2026-10-14" />);
const [chromePart, sheetPart] = html.split('data-admin-sheet="true"');

const read = (relative: string) => readFileSync(path.join(process.cwd(), relative), "utf8");
const detailCss = read("src/app/admin/results/[sessionId]/detail.module.css");
const resultCss = read("src/app/c/[courseCode]/result/result.module.css");

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
    expect(html).toContain("직업선호도 검사 결과");
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

  it("결과지는 기존 공유 컴포넌트(mode=print)와 동일한 내용이다", () => {
    const sharedPrint = renderToStaticMarkup(<ResultScreen view={view} mode="print" />);
    expect(html).toContain(sharedPrint);
  });

  it("점수·해설·추천직업이 결과지에 모두 나온다", () => {
    for (const text of ["홍길동", "테스트 과정", "사회형", "진취형", "나의 흥미", "나의 성향", "가정봉사원", "매장감시원", "기관명 · 문의처 자리"]) {
      expect(sheetPart, text).toContain(text);
    }
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

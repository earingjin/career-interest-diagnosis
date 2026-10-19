import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminResultCover } from "./AdminResultCover";

const view = {
  nickname: "홍길동",
  submittedAt: "2026-10-14T03:00:00.000Z",
};

const html = renderToStaticMarkup(<AdminResultCover view={view} />);
const css = readFileSync(path.join(process.cwd(), "src/app/admin/results/[sessionId]/cover.module.css"), "utf8");

describe("AdminResultCover", () => {
  it("renders only the required privacy-cover content with existing person and date data", () => {
    expect(html).toContain('data-print-cover="true"');
    expect(html).toContain("직업 흥미 검사");
    expect(html).toContain("CAREER INTEREST ASSESSMENT");
    expect(html).toContain("홍길동");
    expect(html).toContain("2026년 10월 14일");
    expect(html).toContain("본 문서에는 개인의 직업흥미 진단결과가 포함되어 있습니다. 열람 및 보관 시");
    expect(html).toContain("개인정보 보호에 유의해 주시기 바랍니다.");
    expect(html).toContain("경찰전직지원센터");
    expect(html).toContain("제이엠커리어");
    expect(html).toContain("police-logo.png");
    expect(html).toContain("jm-career-logo.png");
    expect(html).toContain('viewBox="0 0 48 56"');
    expect(html).not.toContain('viewBox="0 0 80 92"');
    expect(html).not.toContain("CONFIDENTIAL REPORT");
    expect(html).not.toMatch(/>7점<|>6점</);
  });

  it("is a separate A4 page that breaks before the existing result pages", () => {
    expect(css).toContain("width: 210mm");
    expect(css).toContain("height: 296mm");
    const printBlock = css.slice(css.indexOf("@media print"));
    expect(printBlock).toMatch(/\.cover\s*{[^}]*break-after:\s*page/);
  });
});

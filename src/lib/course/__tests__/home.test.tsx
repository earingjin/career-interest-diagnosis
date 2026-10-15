import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; prefetch?: boolean; className?: string }) => (
    <a href={href} className={rest.className} {...Object.fromEntries(Object.entries(rest).filter(([k]) => k.startsWith("data-")))}>
      {children}
    </a>
  ),
}));

import { Intro, StartAction, type StartState } from "@/app/HomeSections";

const CODE = "abcDEF0123456789_-xy";
const states: Record<string, StartState> = {
  ok: { kind: "ok", code: CODE, name: "프로토타입 과정" },
  none: { kind: "none" },
  inactive: { kind: "inactive" },
  error: { kind: "error" },
  loading: { kind: "loading" },
};

const render = (state: StartState) =>
  renderToStaticMarkup(
    <Intro hero={<StartAction state={state} variant="hero" />} footer={<StartAction state={state} variant="footer" />} />,
  );

describe("홈 화면: 시작 버튼", () => {
  it("기본 과정이 있으면 시작 버튼이 기존 참여자 입력 화면(/c/{과정 코드})으로 연결된다", () => {
    const html = render(states.ok);
    expect(html).toContain("직업흥미 진단 시작하기");
    expect(html).toContain(`href="/c/${CODE}"`);
    expect((html.match(/data-start-cta=/g) ?? []).length).toBe(2); // 첫 화면과 하단
    expect(html).not.toContain("data-start-notice");
  });

  it("버튼이 가리키는 곳은 /c/{코드} 하나뿐이다 (다른 과정이나 관리자로 연결되지 않음)", () => {
    const hrefs = [...render(states.ok).matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(new Set(hrefs)).toEqual(new Set([`/c/${CODE}`]));
  });

  for (const kind of ["none", "inactive", "error"] as const) {
    it(`기본 과정이 ${kind} 이면 어디로도 연결하지 않고 안내만 보여준다`, () => {
      const html = render(states[kind]);
      expect(html).not.toContain("href=");
      expect(html).not.toContain("data-start-cta");
      expect(html).not.toContain("직업흥미 진단 시작하기");
      expect((html.match(new RegExp(`data-start-notice="${kind}"`, "g")) ?? []).length).toBe(2);
      expect(html).toContain('role="status"');
    });
  }

  it("안내 문구가 상태마다 다르다", () => {
    expect(render(states.none)).toContain("지금은 진단을 시작할 수 없어요");
    expect(render(states.inactive)).toContain("지금은 진단을 진행하고 있지 않아요");
    expect(render(states.error)).toContain("잠시 문제가 생겨");
  });

  it("안내 문구에 과정 코드나 DB 오류 같은 내부 정보가 없다", () => {
    for (const kind of ["none", "inactive", "error"]) {
      const html = render(states[kind]);
      for (const word of [CODE, "is_default", "is_active", "courses", "42703", "DB"]) expect(html, `${kind}:${word}`).not.toContain(word);
    }
  });

  it("조회하는 동안에는 버튼 대신 준비 중 문구를 보여준다", () => {
    const html = render(states.loading);
    expect(html).toContain("시작 준비 중");
    expect(html).not.toContain("href=");
  });
});

describe("홈 화면: 내용과 제외 항목", () => {
  const html = render(states.ok);
  const text = html.replace(/<[^>]+>/g, " ");

  it("서비스 소개의 제목과 핵심 안내가 있다", () => {
    expect(html).toContain("<h1");
    expect(text).toContain("나에게 맞는 직업 흥미를");
    for (const phrase of ["이런 진단이에요", "진행 방법", "시작하기 전에", "42개", "5개 이상", "6가지 흥미 유형", "전체 결과를 웹 화면에서 확인"]) {
      expect(text, phrase).toContain(phrase);
    }
  });

  it("고객에게 PDF 저장·인쇄를 안내하지 않는다", () => {
    expect(text).not.toMatch(/PDF|인쇄|A4/);
    expect(text).toContain("충분히 확인한 뒤 종료해 주세요");
  });

  it("QR 코드 안내, 과정 선택 UI, 관리자 링크·로그인이 없다", () => {
    for (const word of ["QR", "큐알", "과정 선택", "과정을 선택", "관리자", "admin", "로그인"]) {
      expect(html, word).not.toContain(word);
    }
    for (const tag of ["<select", "<input", "<form", "<option", "<textarea"]) expect(html, tag).not.toContain(tag);
  });

  it("스타일 파일의 글자 크기는 모두 1rem(18px) 이상이다", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/home.module.css"), "utf8");
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(5);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(1);
    expect(css).not.toMatch(/font-size:\s*[\d.]+px/);
    expect(css).toMatch(/min-height:\s*6\d?px/); // 시작 버튼 높이 56px 이상
  });
});

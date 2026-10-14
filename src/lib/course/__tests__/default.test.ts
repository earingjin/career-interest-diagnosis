import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = { code: string; name: string; is_active: boolean; is_default: boolean };
let rows: Row[] = [];
let calls: URL[] = [];
let failWith: { status: number; code: string } | null = null;

// 실제 supabase-js 가 만드는 요청으로 어떤 조건으로 조회하는지 확인한다.
async function fakeFetch(input: RequestInfo | URL) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  calls.push(url);
  if (failWith) return new Response(JSON.stringify({ code: failWith.code, message: "x" }), { status: failWith.status });
  let found = rows;
  if (url.searchParams.get("is_default") === "eq.true") found = found.filter((r) => r.is_default);
  const limit = Number(url.searchParams.get("limit") ?? 1000);
  const body = found.slice(0, limit).map(({ code, name, is_active }) => ({ code, name, is_active }));
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const db = () =>
  createClient("https://test.supabase.co", "test-key", {
    global: { fetch: fakeFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as Parameters<typeof import("../default").findDefaultCourse>[0];

import { findDefaultCourse } from "../default";

const CODE = "abcDEF0123456789_-xy";
const course = (over: Partial<Row> = {}): Row => ({ code: CODE, name: "프로토타입 과정", is_active: true, is_default: true, ...over });

beforeEach(() => {
  rows = [];
  calls = [];
  failWith = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("findDefaultCourse", () => {
  it("활성 상태로 지정된 기본 과정이 있으면 그 과정의 코드와 이름을 돌려준다", async () => {
    rows = [course()];
    expect(await findDefaultCourse(db())).toEqual({ kind: "ok", code: CODE, name: "프로토타입 과정" });
  });

  it("지정되지 않은 과정은 활성이어도 기본 과정이 아니다 (none)", async () => {
    rows = [course({ is_default: false }), course({ code: "otherCourse0123456789", is_default: false })];
    expect(await findDefaultCourse(db())).toEqual({ kind: "none" });
  });

  it("과정이 하나도 없으면 none", async () => {
    expect(await findDefaultCourse(db())).toEqual({ kind: "none" });
  });

  it("기본 과정이 비활성이면 inactive 이고 코드를 돌려주지 않는다", async () => {
    rows = [course({ is_active: false })];
    const outcome = await findDefaultCourse(db());
    expect(outcome).toEqual({ kind: "inactive" });
    expect(JSON.stringify(outcome)).not.toContain(CODE);
  });

  it("활성 과정이 따로 있어도 지정된 기본 과정이 비활성이면 그쪽으로 연결하지 않는다", async () => {
    rows = [course({ is_active: false }), course({ code: "otherCourse0123456789", is_default: false, is_active: true })];
    expect((await findDefaultCourse(db())).kind).toBe("inactive");
  });

  it("기본 과정이 둘 이상 지정되어 있으면 어느 쪽인지 알 수 없어 연결하지 않는다 (error)", async () => {
    rows = [course(), course({ code: "otherCourse0123456789" })];
    expect(await findDefaultCourse(db())).toEqual({ kind: "error" });
  });

  it("과정 코드 형식이 올바르지 않으면 연결하지 않는다 (error)", async () => {
    for (const code of ["SHORT", "has space 0123456789ab", "한글코드한글코드한글코드한글코드", `${"a".repeat(16)}/../admin`]) {
      rows = [course({ code })];
      expect(await findDefaultCourse(db()), code).toEqual({ kind: "error" });
    }
  });

  it("DB 오류(예: 새 컬럼이 아직 없음)는 error 이고 던지지 않는다", async () => {
    rows = [course()];
    failWith = { status: 400, code: "42703" };
    expect(await findDefaultCourse(db())).toEqual({ kind: "error" });
    failWith = { status: 500, code: "PGRST000" };
    expect(await findDefaultCourse(db())).toEqual({ kind: "error" });
  });

  it("코드나 ID 를 조건으로 넣지 않고 is_default=true 로만 조회한다 (코드 하드코딩 없음)", async () => {
    rows = [course()];
    await findDefaultCourse(db());
    expect(calls).toHaveLength(1);
    const params = calls[0].searchParams;
    expect(calls[0].pathname).toBe("/rest/v1/courses");
    expect(params.get("is_default")).toBe("eq.true");
    expect(params.get("select")).toBe("code,name,is_active");
    expect([...params.keys()].sort()).toEqual(["is_default", "limit", "select"]);
  });

  it("조회 결과에 과정 ID 가 들어 있지 않다", async () => {
    rows = [course()];
    expect(Object.keys((await findDefaultCourse(db())) as object).sort()).toEqual(["code", "kind", "name"]);
  });
});

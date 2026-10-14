import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { envFor, makeConfig } from "./helpers";
import type { AdminConfig } from "../config";
import { createAdminSessionToken } from "../session";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ cookie: "", calls: [] as URL[], fail: false }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => name === "jd_admin" && state.cookie ? { value: state.cookie } : undefined,
}) }));

type Row = { id: string; nickname: string; status: string; submitted_at: string; courses: { name: string }; results: { top1: string; top2: string } | null };
let rows: Row[] = [];
// 실제 supabase-js가 생성하는 URL로 필터/정렬/페이지 이동을 검증한다.
async function fetchRows(input: RequestInfo | URL) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  state.calls.push(url);
  if (state.fail) return new Response(JSON.stringify({ code: "DB_DOWN", message: "test" }), { status: 500 });
  const p = url.searchParams;
  let found = rows.filter((row) => `eq.${row.status}` === p.get("status"));
  for (const value of p.getAll("submitted_at")) {
    const [op, ...rest] = value.split(".");
    const time = Date.parse(rest.join("."));
    found = found.filter((row) => op === "gte" ? Date.parse(row.submitted_at) >= time : Date.parse(row.submitted_at) < time);
  }
  const or = p.get("or");
  if (or) {
    const m = or.match(/^\(submitted_at\.(lt|gt)\.(.+),and\(submitted_at\.eq\.(.+),id\.(lt|gt)\.([0-9a-f-]+)\)\)$/)!;
    expect(m).not.toBeNull();
    const [, op, timestamp, equalTimestamp, idOp, id] = m;
    expect(timestamp).toBe(equalTimestamp); expect(op).toBe(idOp);
    const canonical = (s: string) => s.replace("+00:00", "Z").replace(/\.(\d+)Z$/, (_, digits: string) => `.${digits.padEnd(6, "0")}Z`);
    found = found.filter((row) => {
      const a = canonical(row.submitted_at), b = canonical(timestamp);
      return op === "lt" ? a < b || a === b && row.id < id : a > b || a === b && row.id > id;
    });
  }
  const ascending = p.get("order") === "submitted_at.asc,id.asc";
  expect(p.get("order")).toBe(ascending ? "submitted_at.asc,id.asc" : "submitted_at.desc,id.desc");
  found.sort((a, b) => (a.submitted_at.localeCompare(b.submitted_at) || a.id.localeCompare(b.id)) * (ascending ? 1 : -1));
  return new Response(JSON.stringify(found.slice(0, Number(p.get("limit")))), { status: 200, headers: { "Content-Type": "application/json" } });
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => createClient("https://test.supabase.co", "test-service-key", {
    global: { fetch: fetchRows }, auth: { persistSession: false, autoRefreshToken: false },
  }),
}));

import { encodeResultCursor, loadAdminResults, parseResultsFilter, RESULTS_PAGE_SIZE } from "../results";
import { AdminListInputError } from "../date";
let config: AdminConfig;
const DATE = "2026-10-14";
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
function row(n: number, over: Partial<Row> = {}): Row {
  return { id: id(n), nickname: "같은닉네임", status: "submitted", submitted_at: "2026-10-14T03:00:00.123456+00:00", courses: { name: "과정" }, results: { top1: "S", top2: "E" }, ...over };
}
beforeAll(async () => { config = await makeConfig(); });
beforeEach(() => {
  for (const [name, value] of Object.entries(envFor(config))) vi.stubEnv(name, value);
  state.cookie = createAdminSessionToken(config); state.calls = []; state.fail = false; rows = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("관리자 목록 접근", () => {
  it.each(["missing", "customer", "expired", "tampered", "unconfigured"])("%s 인증은 DB 조회 전에 차단한다", async (kind) => {
    state.cookie = kind === "expired" ? createAdminSessionToken(config, Date.now() - 9 * 3600000) : kind === "tampered" ? "forged.token" : "";
    if (kind === "unconfigured") { state.cookie = createAdminSessionToken(config); vi.stubEnv("ADMIN_ID", ""); }
    await expect(loadAdminResults({ date: DATE })).rejects.toThrow("NEXT_REDIRECT");
    expect(state.calls).toHaveLength(0);
  });
  it("DB 실패를 빈 목록으로 숨기지 않는다", async () => {
    state.fail = true;
    await expect(loadAdminResults({ date: DATE })).rejects.toThrow("관리자 결과 목록 조회 실패");
  });
});

describe("완료 고객 목록", () => {
  it("한국 자정 경계, 진행 중 제외, 동명 세션, 결과 없는 완료 세션", async () => {
    rows = [row(1, { submitted_at: "2026-10-13T14:59:59.999999+00:00" }), row(2, { submitted_at: "2026-10-13T15:00:00.000000+00:00" }),
      row(3, { submitted_at: "2026-10-14T14:59:59.999999+00:00" }), row(4, { submitted_at: "2026-10-14T15:00:00.000000+00:00" }),
      row(5, { status: "in_progress" }), row(6, { results: null })];
    const page = await loadAdminResults({ date: DATE });
    expect(page.items.map((r) => r.id)).toEqual([id(3), id(6), id(2)]);
    expect(page.items.every((r) => r.nickname === "같은닉네임")).toBe(true);
    expect(page.items[1]).toMatchObject({ top1: null, top2: null, error: "결과 없음 · 확인 필요" });
    const url = state.calls[0];
    expect(url.pathname).toBe("/rest/v1/sessions");
    expect(url.searchParams.get("select")).toBe("id,nickname,submitted_at,courses(name),results(top1,top2)");
    expect(url.searchParams.get("limit")).toBe(String(RESULTS_PAGE_SIZE + 1));
  });
  it("잘못된 순위도 오류 행으로 남긴다", async () => {
    rows = [row(1, { results: { top1: "X", top2: "R" } }), row(2, { results: { top1: "R", top2: "R" } })];
    const page = await loadAdminResults({ date: DATE });
    expect(page.items).toHaveLength(2);
    expect(page.items.every((r) => r.error === "결과 유형 오류 · 확인 필요")).toBe(true);
  });
  it("빈 날짜는 빈 목록", async () => {
    expect(await loadAdminResults({ date: DATE })).toMatchObject({ items: [], next: null, previous: null });
  });
  it("1000명을 넘겨도 같은 완료시각의 세션을 빠짐없이 페이지 이동한다", async () => {
    rows = Array.from({ length: 1205 }, (_, i) => row(i + 1));
    const seen: string[] = [];
    let page = await loadAdminResults({ date: DATE });
    while (true) {
      seen.push(...page.items.map((r) => r.id));
      if (!page.next) break;
      page = await loadAdminResults({ date: DATE, after: page.next });
    }
    expect(seen).toHaveLength(1205); expect(new Set(seen).size).toBe(1205);
    expect(seen).toEqual(rows.map((r) => r.id).sort().reverse());
  });
  it("이전 페이지 복원 및 조회 중 새 완료 세션 추가", async () => {
    rows = Array.from({ length: 115 }, (_, i) => row(i + 1));
    const first = await loadAdminResults({ date: DATE });
    rows.push(row(9999, { submitted_at: "2026-10-14T04:00:00.000000+00:00" }));
    const second = await loadAdminResults({ date: DATE, after: first.next! });
    expect(second.items.map((r) => r.id)).toEqual(Array.from({ length: 50 }, (_, i) => id(65 - i)));
    const previous = await loadAdminResults({ date: DATE, before: second.previous! });
    expect(previous.items).toEqual(first.items);
    expect(previous.previous).not.toBeNull(); // 새로 추가된 고객은 더 앞에 있으며 첫 페이지에서 확인 가능
    const third = await loadAdminResults({ date: DATE, after: second.next! });
    expect(third.items).toHaveLength(15); expect(third.next).toBeNull();
  });
});

describe("조회 조건 검증", () => {
  it("기본 날짜는 한국 기준 오늘", () => {
    expect(parseResultsFilter({}, new Date("2026-10-13T15:00:00Z")).date).toBe(DATE);
  });
  it.each([{ date: "2026-02-29" }, { date: [DATE, DATE] }, { date: "" }, { date: DATE, after: "" },
    { date: DATE, after: "a", before: "b" }, { date: DATE, after: "injection,(id.gt.x)" },
    { date: DATE, after: encodeResultCursor({ id: id(1), submittedAt: "2026-10-15T00:00:00Z" }) },
    { date: DATE, after: encodeResultCursor({ id: "bad", submittedAt: "2026-10-14T00:00:00Z" }) }])("무효 조건은 DB 조회 전에 거부: %j", async (params) => {
    await expect(loadAdminResults(params)).rejects.toThrow(AdminListInputError);
    expect(state.calls).toHaveLength(0);
  });
  it("커서의 DB 마이크로초 정밀도를 보존한다", () => {
    const cursor = { id: id(1), submittedAt: "2026-10-14T03:00:00.123456+00:00" };
    expect(parseResultsFilter({ date: DATE, after: encodeResultCursor(cursor) }).cursor).toEqual(cursor);
  });
});

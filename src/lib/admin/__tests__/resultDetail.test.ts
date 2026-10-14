import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminConfig } from "../config";
import { createAdminSessionToken } from "../session";
import { envFor, makeConfig } from "./helpers";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  cookies: {} as Record<string, string>,
  calls: [] as URL[],
  fail: false,
  customerSession: null as null | { id: string; status: "in_progress" | "submitted" },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies[name] ? { value: state.cookies[name] } : undefined),
  }),
}));

// 고객 결과 조회(loadResult)가 쓰는 쿠키 세션 확인만 대신한다. 결과 조회 자체는 실제 코드를 쓴다.
vi.mock("@/lib/session/db", () => ({
  getCurrentSessionForCourse: async () => state.customerSession,
}));

type ResultRow = {
  scoring_version: string;
  general_scores: Record<string, number>;
  adjective_scores: Record<string, number>;
  totals: Record<string, number>;
  top1: string;
  top2: string;
  job_recommendations: { type: string; jobs: string[]; count: number }[];
};
type SessionRow = {
  id: string;
  nickname: string;
  status: "in_progress" | "submitted";
  submitted_at: string | null;
  courses: { name: string } | null;
  results: ResultRow | ResultRow[] | null;
};

let sessions: SessionRow[] = [];

// 실제 supabase-js 가 만드는 요청으로 어떤 조건으로 조회하는지 확인한다.
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  state.calls.push(url);
  if (state.fail) return new Response(JSON.stringify({ code: "DB_DOWN", message: "down" }), { status: 500 });
  const idFilter = url.searchParams.get("id");
  const found = sessions.filter((s) => `eq.${s.id}` === idFilter);
  const wantsObject = new Headers(init?.headers).get("accept")?.includes("vnd.pgrst.object");
  if (wantsObject) {
    return found.length === 1
      ? new Response(JSON.stringify(found[0]), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response(JSON.stringify({ code: "PGRST116", message: "no rows" }), { status: 406 });
  }
  return new Response(JSON.stringify(found), { status: 200, headers: { "Content-Type": "application/json" } });
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () =>
    createClient("https://test.supabase.co", "test-service-key", {
      global: { fetch: fakeFetch },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
}));

import { loadResult } from "@/lib/result/load";
import { loadAdminResultDetail } from "../resultDetail";

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const ZERO = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };

function resultRow(top1: string, top2: string, over: Partial<ResultRow> = {}): ResultRow {
  const general = { ...ZERO, [top1]: 7, [top2]: 6 };
  return {
    scoring_version: "1.0.0",
    general_scores: general,
    adjective_scores: { ...ZERO },
    totals: general,
    top1,
    top2,
    job_recommendations: [top1, top2].map((type) => ({
      type,
      jobs: [1, 2, 3, 4, 5].map((n) => `${type}직업${n}`),
      count: 5,
    })),
    ...over,
  };
}

function session(n: number, over: Partial<SessionRow> = {}): SessionRow {
  return {
    id: uuid(n),
    nickname: "같은닉네임",
    status: "submitted",
    submitted_at: "2026-10-14T03:00:00.123456+00:00",
    courses: { name: "테스트 과정" },
    results: resultRow("S", "E"),
    ...over,
  };
}

let config: AdminConfig;
beforeAll(async () => {
  config = await makeConfig();
});

beforeEach(() => {
  for (const [name, value] of Object.entries(envFor(config))) vi.stubEnv(name, value);
  state.cookies = { jd_admin: createAdminSessionToken(config) };
  state.calls = [];
  state.fail = false;
  state.customerSession = null;
  sessions = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("관리자 상세 조회: 인증", () => {
  beforeEach(() => {
    sessions = [session(1)];
  });

  const cases: Record<string, () => void> = {
    "관리자 쿠키 없음": () => (state.cookies = {}),
    "고객 쿠키(jd_session)만 있음": () => (state.cookies = { jd_session: "customer-token-0123456789" }),
    "고객 쿠키 값을 관리자 쿠키 이름에 넣음": () => (state.cookies = { jd_admin: "customer-token-0123456789" }),
    "만료된 관리자 쿠키": () => (state.cookies = { jd_admin: createAdminSessionToken(config, Date.now() - 9 * 3600000) }),
    "변조된 관리자 쿠키": () => (state.cookies = { jd_admin: createAdminSessionToken(config).slice(0, -3) + "AAA" }),
    "관리자 환경 변수 누락": () => vi.stubEnv("ADMIN_PASSWORD_HASH", ""),
  };

  for (const [name, setup] of Object.entries(cases)) {
    it(`${name} → 로그인 화면으로 보내고 DB 를 조회하지 않는다`, async () => {
      setup();
      await expect(loadAdminResultDetail(uuid(1))).rejects.toThrow("NEXT_REDIRECT");
      expect(state.calls).toHaveLength(0);
    });
  }

  it("고객 세션이 제출 완료 상태여도 고객 쿠키로는 관리자 조회가 안 된다", async () => {
    state.cookies = { jd_session: "customer-token-0123456789" };
    state.customerSession = { id: uuid(1), status: "submitted" };
    await expect(loadAdminResultDetail(uuid(1))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.calls).toHaveLength(0);
  });
});

describe("관리자 상세 조회: 세션 ID", () => {
  it("동일한 닉네임의 서로 다른 세션을 ID 로 구분한다", async () => {
    sessions = [
      session(1, { results: resultRow("S", "E"), submitted_at: "2026-10-14T03:00:00.000000+00:00" }),
      session(2, {
        results: resultRow("R", "I"),
        courses: { name: "다른 과정" },
        submitted_at: "2026-10-14T05:30:00.000000+00:00",
      }),
    ];
    const first = await loadAdminResultDetail(uuid(1));
    const second = await loadAdminResultDetail(uuid(2));
    if (first.kind !== "ok" || second.kind !== "ok") throw new Error("조회 실패");

    expect(first.view.nickname).toBe(second.view.nickname);
    expect([first.view.top1.type, first.view.top2.type]).toEqual(["S", "E"]);
    expect([second.view.top1.type, second.view.top2.type]).toEqual(["R", "I"]);
    expect(first.view.courseName).toBe("테스트 과정");
    expect(second.view.courseName).toBe("다른 과정");
    expect(first.view.submittedAt).not.toBe(second.view.submittedAt);
  });

  it("조회 조건은 세션 ID 하나뿐이다 (닉네임으로 찾지 않는다)", async () => {
    sessions = [session(1)];
    await loadAdminResultDetail(uuid(1));
    expect(state.calls).toHaveLength(1);
    const params = state.calls[0].searchParams;
    expect(params.get("id")).toBe(`eq.${uuid(1)}`);
    expect([...params.keys()].sort()).toEqual(["id", "select"]);
    expect(params.get("select")).toContain("results(");
  });

  it("대문자 UUID 는 소문자로 바꿔 조회한다", async () => {
    sessions = [session(0xabc)];
    const outcome = await loadAdminResultDetail(uuid(0xabc).toUpperCase());
    expect(outcome.kind).toBe("ok");
    expect(state.calls[0].searchParams.get("id")).toBe(`eq.${uuid(0xabc)}`);
  });

  it("UUID 형식이 아니면 DB 를 조회하지 않고 invalid_id", async () => {
    for (const id of ["", "abc", "같은닉네임", "1", `${uuid(1)}x`, `${uuid(1)},id.neq.0`, "../admin", "%00", `${uuid(1)}\n`]) {
      expect((await loadAdminResultDetail(id)).kind, JSON.stringify(id)).toBe("invalid_id");
    }
    expect(state.calls).toHaveLength(0);
  });

  it("없는 세션은 not_found", async () => {
    sessions = [session(1)];
    expect((await loadAdminResultDetail(uuid(99))).kind).toBe("not_found");
  });
});

describe("관리자 상세 조회: 세션 상태", () => {
  it("완료 세션은 결과 화면용 뷰를 돌려준다", async () => {
    sessions = [session(1)];
    const outcome = await loadAdminResultDetail(uuid(1));
    expect(outcome.kind).toBe("ok");
    if (outcome.kind === "ok") {
      expect(outcome.view.top1.groups).toHaveLength(4);
      expect(outcome.view.totals).toHaveLength(6);
      expect(outcome.view.submittedAt).toBe("2026-10-14T03:00:00.123Z");
    }
  });

  it("미완료(in_progress) 세션은 결과를 만들지 않고 in_progress", async () => {
    sessions = [session(1, { status: "in_progress", submitted_at: null, results: null })];
    expect(await loadAdminResultDetail(uuid(1))).toEqual({ kind: "in_progress" });
  });

  it("미완료 세션에 결과 행이 남아 있어도 보여주지 않는다", async () => {
    sessions = [session(1, { status: "in_progress", submitted_at: null })];
    expect(await loadAdminResultDetail(uuid(1))).toEqual({ kind: "in_progress" });
  });

  it("제출 완료인데 결과가 없으면 missing_result", async () => {
    sessions = [session(1, { results: null })];
    expect(await loadAdminResultDetail(uuid(1))).toEqual({ kind: "missing_result" });
    sessions = [session(1, { results: [] })];
    expect(await loadAdminResultDetail(uuid(1))).toEqual({ kind: "missing_result" });
  });

  it("저장된 결과가 점수와 맞지 않으면 invalid_result 로 알린다", async () => {
    sessions = [session(1, { results: resultRow("S", "E", { top1: "E", top2: "S" }) })];
    const outcome = await loadAdminResultDetail(uuid(1));
    expect(outcome.kind).toBe("invalid_result");
  });

  it("DB 오류는 삼키지 않고 던진다", async () => {
    state.fail = true;
    await expect(loadAdminResultDetail(uuid(1))).rejects.toThrow("결과 조회 실패");
  });

  it("결과 뷰에 세션 ID·토큰·휴대폰 관련 값이 없다", async () => {
    sessions = [session(1)];
    const outcome = await loadAdminResultDetail(uuid(1));
    const json = JSON.stringify(outcome);
    for (const word of [uuid(1), "sessionId", "session_id", "token", "phone"]) expect(json, word).not.toContain(word);
  });
});

describe("고객 화면과 관리자 화면의 결과 일치", () => {
  it("같은 저장 결과로 만든 뷰가 완전히 같다", async () => {
    sessions = [
      session(1, {
        results: resultRow("A", "I", {
          general_scores: { ...ZERO, A: 7, I: 5, R: 2 },
          adjective_scores: { ...ZERO, A: 3, I: 2 },
          totals: { ...ZERO, A: 10, I: 7, R: 2 },
        }),
      }),
    ];
    state.customerSession = { id: uuid(1), status: "submitted" };

    const customer = await loadResult("abcDEF0123456789_-xy");
    const admin = await loadAdminResultDetail(uuid(1));
    if (customer.kind !== "ok" || admin.kind !== "ok") throw new Error("조회 실패");
    expect(admin.view).toEqual(customer.view);
    expect(customer.view.totals.find((t) => t.type === "A")).toMatchObject({ total: 10, general: 7, adjective: 3 });
  });

  it("동명 세션이 있어도 고객은 자기 세션, 관리자는 선택한 세션의 결과를 본다", async () => {
    sessions = [session(1, { results: resultRow("S", "E") }), session(2, { results: resultRow("R", "I") })];
    state.customerSession = { id: uuid(2), status: "submitted" };
    const customer = await loadResult("abcDEF0123456789_-xy");
    const adminFirst = await loadAdminResultDetail(uuid(1));
    const adminSecond = await loadAdminResultDetail(uuid(2));
    if (customer.kind !== "ok" || adminFirst.kind !== "ok" || adminSecond.kind !== "ok") throw new Error("조회 실패");
    expect(customer.view).toEqual(adminSecond.view);
    expect(customer.view).not.toEqual(adminFirst.view);
  });

  it("고객 결과 조회의 기존 동작(세션 없음 / 미완료)은 그대로다", async () => {
    sessions = [session(1, { status: "in_progress", submitted_at: null, results: null })];
    expect(await loadResult("abcDEF0123456789_-xy")).toEqual({ kind: "no_session" });
    state.customerSession = { id: uuid(1), status: "in_progress" };
    expect(await loadResult("abcDEF0123456789_-xy")).toEqual({ kind: "in_progress" });
    expect(state.calls).toHaveLength(0); // 미완료 고객은 결과 조회 자체를 하지 않는다
  });

  it("고객 결과 조회는 결과 누락·손상 시 예전처럼 오류를 던진다 (페이지가 안내 문구를 보여줌)", async () => {
    state.customerSession = { id: uuid(1), status: "submitted" };
    sessions = [session(1, { results: null })];
    await expect(loadResult("abcDEF0123456789_-xy")).rejects.toThrow("결과 행이 없습니다");
    sessions = [session(1, { results: resultRow("S", "E", { top1: "E", top2: "S" }) })];
    await expect(loadResult("abcDEF0123456789_-xy")).rejects.toThrow();
  });
});

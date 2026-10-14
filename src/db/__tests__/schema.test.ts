import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import { generateCourseCode, generateSessionToken, phoneKey, sha256Hex } from "../../lib/security/hash";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const enabled = Boolean(url && serviceKey && anonKey);

if (!enabled) {
  console.warn(
    "[schema.test] NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY 가 모두 설정되어 있지 않아 DB 테스트를 건너뜁니다.",
  );
}

const CHECK_VIOLATION = "23514";
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

(enabled ? describe : describe.skip)(
  enabled ? "DB 스키마와 접근 보안" : "DB 스키마와 접근 보안 (건너뜀: Supabase 환경 변수 3개가 모두 설정되지 않음)",
  () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  const code = generateCourseCode();
  let courseId = "";
  let sessionId = "";

  function newSession(nickname: string) {
    return admin
      .from("sessions")
      .insert({
        course_id: courseId,
        nickname,
        phone_key: phoneKey("test-secret", "1234"),
        token_hash: sha256Hex(generateSessionToken()),
      })
      .select("id")
      .single();
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, opts);
    anon = createClient(url!, anonKey!, opts);

    const course = await admin.from("courses").insert({ code, name: "schema-test" }).select("id").single();
    expect(course.error).toBeNull();
    courseId = course.data!.id;

    const session = await newSession("나무");
    expect(session.error).toBeNull();
    sessionId = session.data!.id;
  });

  afterAll(async () => {
    if (!admin) return;
    // courses 삭제 시 sessions / responses / results 는 cascade 로 함께 지워진다.
    await admin.from("courses").delete().eq("code", code);

    const leftCourses = await admin.from("courses").select("id").eq("code", code);
    expect(leftCourses.data ?? []).toHaveLength(0);
    if (courseId) {
      const leftSessions = await admin.from("sessions").select("id").eq("course_id", courseId);
      expect(leftSessions.data ?? []).toHaveLength(0);
    }
    if (sessionId) {
      const leftResponses = await admin.from("responses").select("item_id").eq("session_id", sessionId);
      const leftResults = await admin.from("results").select("session_id").eq("session_id", sessionId);
      expect(leftResponses.data ?? []).toHaveLength(0);
      expect(leftResults.data ?? []).toHaveLength(0);
    }
  });

  it("a. anon 키로는 테이블을 읽을 수 없다 (0행 또는 오류)", async () => {
    for (const table of ["sessions", "responses", "results", "courses"]) {
      const { data, error } = await anon.from(table).select("*");
      expect(error !== null || (data ?? []).length === 0, table).toBe(true);
    }
  });

  it("b. anon 키로 courses 에 insert 하면 실패한다", async () => {
    const anonCode = generateCourseCode();
    const { error } = await anon.from("courses").insert({ code: anonCode, name: "anon-test" });
    expect(error).not.toBeNull();
    const check = await admin.from("courses").select("id").eq("code", anonCode);
    expect(check.data ?? []).toHaveLength(0);
  });

  it("c. 짧은 code 는 insert 에 실패한다", async () => {
    const { error } = await admin.from("courses").insert({ code: "SHORT", name: "short" });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it('d. nickname "가" 는 실패, "나무" 는 성공한다', async () => {
    const bad = await newSession("가");
    expect(bad.error?.code).toBe(CHECK_VIOLATION);
    // "나무" 는 beforeAll 에서 이미 성공적으로 생성됐다.
    expect(sessionId).not.toBe("");
  });

  it('e. item_id "g43", "a31" 은 실패한다', async () => {
    for (const item_id of ["g43", "a31"]) {
      const { error } = await admin.from("responses").insert({ session_id: sessionId, item_id, value: true });
      expect(error?.code, item_id).toBe(CHECK_VIOLATION);
    }
  });

  it('f. item_id "a01" 을 value=false 로 insert 하면 실패한다', async () => {
    const { error } = await admin.from("responses").insert({ session_id: sessionId, item_id: "a01", value: false });
    expect(error?.code).toBe(CHECK_VIOLATION);

    const ok = await admin.from("responses").insert({ session_id: sessionId, item_id: "a01", value: true });
    expect(ok.error).toBeNull();
  });

  it("g. results 의 top1 과 top2 가 같으면 실패한다", async () => {
    const row = {
      session_id: sessionId,
      scoring_version: "test",
      general_scores: {},
      adjective_scores: {},
      totals: {},
      job_recommendations: {},
    };
    const bad = await admin.from("results").insert({ ...row, top1: "R", top2: "R" });
    expect(bad.error?.code).toBe(CHECK_VIOLATION);

    const ok = await admin.from("results").insert({ ...row, top1: "R", top2: "I" });
    expect(ok.error).toBeNull();
  });
  },
);

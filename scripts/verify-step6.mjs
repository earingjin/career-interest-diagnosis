// 6단계(제출과 결과 생성)를 검증한다.
//
// 실행 전에 다음이 필요하다.
//   1. SQL Editor 에서 supabase/migrations/20261015000000_submit_and_save.sql 을 실행해 두었을 것
//   2. 앱 서버(npm run dev)가 실행 중일 것
//   npm run verify:step6
//
// 환경 변수(.env.local 을 --env-file 로 읽는다):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, (선택) NEXT_PUBLIC_SUPABASE_ANON_KEY
//   VERIFY_BASE_URL (기본 http://localhost:3000, localhost / 127.0.0.1 만 허용)
//
// 이 스크립트는 DB 에 테스트 전용 과정을 만들고, 끝나면 (실패해도) 지운다.

import { randomBytes, randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.VERIFY_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const COOKIE_NAME = "jd_session";
const FORBIDDEN_WORDS = ["token", "token_hash", "phone_key", "sessionId"];
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const tally = { pass: 0, fail: 0, warn: 0 };

function pass(label, detail) {
  tally.pass++;
  console.log(`✓ ${label} — ${detail}`);
}
function fail(label, reason) {
  tally.fail++;
  console.log(`✗ ${label} — ${reason}`);
}
function check(ok, label, passDetail, failReason) {
  if (ok) pass(label, passDetail);
  else fail(label, failReason);
  return ok;
}

function assertLocalBase() {
  let host = "";
  try {
    host = new URL(BASE).hostname;
  } catch {
    // 아래에서 막는다.
  }
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.log("로컬 주소에서만 실행합니다");
    process.exit(1);
  }
}

const randomCourseCode = () => randomBytes(18).toString("base64url"); // 24자, [A-Za-z0-9_-]
const randomDigits = (length) => Array.from({ length }, () => randomInt(0, 10)).join("");
const pad2 = (n) => String(n).padStart(2, "0");

function extractSessionCookie(response) {
  const lines =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];
  for (const line of lines.length ? lines : [response.headers.get("set-cookie") ?? ""]) {
    const match = new RegExp(`(?:^|[,;\\s])${COOKIE_NAME}=([^;,\\s]+)`).exec(line);
    if (match) return match[1];
  }
  return null;
}

function request(path, { method = "GET", cookie, body } = {}) {
  const headers = {};
  if (method !== "GET") {
    headers.Origin = BASE;
    headers["Content-Type"] = "application/json";
  }
  if (cookie) headers.Cookie = `${COOKIE_NAME}=${cookie}`;
  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
}

/** 응답 본문을 문자열과 JSON 으로 함께 읽는다. 본문은 s7 검사를 위해 모아 둔다. */
async function readBody(response, bodies, label) {
  const text = await response.text();
  bodies.push({ label, text });
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

async function countResponses(db, sessionId) {
  const { count, error } = await db
    .from("responses")
    .select("item_id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw new Error(`responses 개수 조회 실패: ${error.message}`);
  return count ?? 0;
}

async function main() {
  assertLocalBase();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !serviceKey) {
    console.log("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local 확인).");
    process.exit(1);
  }

  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const db = createClient(url, serviceKey, opts);

  // 마이그레이션 적용 여부: 없는 세션으로 호출하면 함수가 SESSION_NOT_FOUND 를 내야 한다.
  const probe = await db.rpc("save_response", { p_session_id: NIL_UUID, p_item_id: "g01", p_value: true });
  if (!probe.error?.message?.includes("SESSION_NOT_FOUND")) {
    fail(
      "준비. DB 함수 확인",
      `save_response 가 기대대로 동작하지 않음 (마이그레이션 미적용?): ${probe.error?.message ?? "오류 없이 성공함"}`,
    );
    return;
  }
  pass("준비. DB 함수 확인", "save_response 가 없는 세션에 SESSION_NOT_FOUND 를 냄");

  const courseCode = randomCourseCode();
  const bodies = [];
  let courseInserted = false;

  try {
    const { data: course, error: courseError } = await db
      .from("courses")
      .insert({ code: courseCode, name: "자동검증 과정" })
      .select("id")
      .single();
    courseInserted = true;
    if (courseError) {
      fail("준비. 과정 생성", courseError.message);
      return;
    }

    const nickname = `검증${randomDigits(4)}`;
    const enter = await request("/api/session/enter", {
      method: "POST",
      body: { courseCode, nickname, phoneLast4: randomDigits(4), consent: true },
    });
    await readBody(enter, bodies, "enter");
    const cookie = extractSessionCookie(enter);
    if (!cookie) {
      fail("준비. 세션 생성", `쿠키 발급 실패 (enter 응답 ${enter.status})`);
      return;
    }
    const { data: sessionRow, error: sessionError } = await db
      .from("sessions")
      .select("id")
      .eq("course_id", course.id)
      .eq("nickname", nickname)
      .single();
    if (sessionError) {
      fail("준비. 세션 조회", sessionError.message);
      return;
    }
    const sessionId = sessionRow.id;
    pass("준비. 세션 생성", `enter ${enter.status}, 쿠키 발급됨`);

    const save = (itemId, value) =>
      request("/api/session/response", { method: "POST", cookie, body: { courseCode, itemId, value } });
    const submit = () => request("/api/session/submit", { method: "POST", cookie, body: { courseCode } });

    // s1. 응답이 적은 상태에서 제출 → 400 GENERAL_INCOMPLETE
    await save("g01", true);
    const s1 = await submit();
    const s1Body = await readBody(s1, bodies, "s1 submit");
    check(
      s1.status === 400 && s1Body.json?.error?.code === "GENERAL_INCOMPLETE",
      "s1. 미완료 제출 거부",
      `400 GENERAL_INCOMPLETE ("${s1Body.json?.error?.message}")`,
      `기대 400 GENERAL_INCOMPLETE, 실제 ${s1.status} ${s1Body.text.slice(0, 200)}`,
    );

    // s2. g01~g42 전부 true, a01~a05 선택 후 제출 → 200 { ok: true }
    const failedSaves = [];
    for (let n = 1; n <= 42; n++) {
      const r = await save(`g${pad2(n)}`, true);
      if (r.status !== 200) failedSaves.push(`g${pad2(n)}:${r.status}`);
    }
    for (let n = 1; n <= 5; n++) {
      const r = await save(`a${pad2(n)}`, true);
      if (r.status !== 200) failedSaves.push(`a${pad2(n)}:${r.status}`);
    }
    const before = await countResponses(db, sessionId);
    const s2 = await submit();
    const s2Body = await readBody(s2, bodies, "s2 submit");
    const s2Keys = s2Body.json ? Object.keys(s2Body.json).sort().join(",") : "";
    check(
      failedSaves.length === 0 && s2.status === 200 && s2Body.json?.ok === true,
      "s2. 제출 성공",
      `응답 47개 저장 후 200 { ok: true }, 본문 키: ${s2Keys}`,
      failedSaves.length > 0
        ? `응답 저장 실패: ${failedSaves.join(", ")}`
        : `기대 200 ok, 실제 ${s2.status} ${s2Body.text.slice(0, 200)}`,
    );
    check(
      s2Keys === "next,ok" && s2Body.json?.next === `/c/${courseCode}/result`,
      "s2-2. 제출 응답에 결과 내용 없음",
      `{ ok, next } 만 반환 (next=${s2Body.json?.next})`,
      `본문 키가 ok,next 가 아님: ${s2Keys}`,
    );

    // s3. DB: submitted, results 1행, top1 ≠ top2
    const { data: afterSession } = await db
      .from("sessions")
      .select("status, submitted_at")
      .eq("id", sessionId)
      .single();
    const { data: resultRows, error: resultError } = await db
      .from("results")
      .select("top1, top2, totals, scoring_version")
      .eq("session_id", sessionId);
    const result = resultRows?.[0];
    check(
      afterSession?.status === "submitted" &&
        afterSession?.submitted_at &&
        !resultError &&
        resultRows?.length === 1 &&
        result.top1 !== result.top2,
      "s3. 제출 상태와 결과 저장",
      `status=submitted, results 1행, top1=${result?.top1} top2=${result?.top2}, 버전 ${result?.scoring_version}`,
      `status=${afterSession?.status}, results ${resultRows?.length ?? resultError?.message}행, top1=${result?.top1} top2=${result?.top2}`,
    );

    // s4. 한 번 더 제출 → 409 ALREADY_SUBMITTED
    const s4 = await submit();
    const s4Body = await readBody(s4, bodies, "s4 submit");
    check(
      s4.status === 409 && s4Body.json?.error?.code === "ALREADY_SUBMITTED",
      "s4. 중복 제출 거부",
      "409 ALREADY_SUBMITTED",
      `기대 409 ALREADY_SUBMITTED, 실제 ${s4.status} ${s4Body.text.slice(0, 200)}`,
    );

    // s5. 제출 후 응답 저장 → 409 ALREADY_SUBMITTED (라우트, DB 함수 각각)
    const s5 = await save("g01", false);
    const s5Body = await readBody(s5, bodies, "s5 response");
    check(
      s5.status === 409 && s5Body.json?.error?.code === "ALREADY_SUBMITTED",
      "s5. 제출 후 응답 저장 거부 (API)",
      `409 ALREADY_SUBMITTED ("${s5Body.json?.error?.message}")`,
      `기대 409 ALREADY_SUBMITTED, 실제 ${s5.status} ${s5Body.text.slice(0, 200)}`,
    );
    // 라우트는 DB 함수 전에 상태를 먼저 확인하므로, DB 함수 자체의 거부도 따로 확인한다.
    const direct = await db.rpc("save_response", { p_session_id: sessionId, p_item_id: "g02", p_value: false });
    check(
      direct.error?.message?.includes("ALREADY_SUBMITTED") === true,
      "s5-2. 제출 후 응답 저장 거부 (DB 함수)",
      "save_response 가 ALREADY_SUBMITTED 로 거부",
      `기대 ALREADY_SUBMITTED, 실제 ${direct.error?.message ?? "성공함"}`,
    );

    // s6. 제출 전후 responses 행 수와 값이 같다
    const after = await countResponses(db, sessionId);
    const { data: g01g02 } = await db
      .from("responses")
      .select("item_id, value")
      .eq("session_id", sessionId)
      .in("item_id", ["g01", "g02"]);
    const unchanged = (g01g02 ?? []).length === 2 && g01g02.every((row) => row.value === true);
    check(
      before === after && unchanged,
      "s6. 제출 후 응답 변경 없음",
      `제출 전 ${before}행 = 제출 후 ${after}행, g01·g02 값 그대로`,
      `제출 전 ${before}행, 제출 후 ${after}행, g01·g02=${JSON.stringify(g01g02)}`,
    );

    // s7. 응답 본문에 민감한 값 없음
    const snapshot = await request(`/api/session/responses?courseCode=${encodeURIComponent(courseCode)}`, { cookie });
    await readBody(snapshot, bodies, "GET responses");
    const leaks = bodies.flatMap(({ label, text }) =>
      FORBIDDEN_WORDS.filter((word) => text.includes(word)).map((word) => `${label}: ${word}`),
    );
    check(
      leaks.length === 0,
      "s7. 민감한 값 노출 없음",
      `본문 ${bodies.length}개에 ${FORBIDDEN_WORDS.join(", ")} 없음`,
      leaks.join(" | "),
    );

    // s8. anon 키로는 DB 함수를 실행할 수 없다 (권한 회수 확인)
    if (anonKey) {
      const anon = createClient(url, anonKey, opts);
      const denied = await anon.rpc("save_response", { p_session_id: NIL_UUID, p_item_id: "g01", p_value: true });
      // 함수 본문이 실행됐다면 SESSION_NOT_FOUND 가 나온다. 그 전에 권한 오류로 막혀야 한다.
      check(
        denied.error !== null && !denied.error.message.includes("SESSION_NOT_FOUND"),
        "s8. anon 실행 권한 없음",
        `anon 호출이 함수 실행 전에 거부됨 (${denied.error?.code ?? "-"} ${denied.error?.message ?? ""})`,
        denied.error ? "anon 키로 함수 본문이 실행됨 (SESSION_NOT_FOUND)" : "anon 키로 호출이 성공함",
      );
    } else {
      console.log("  (NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없어 s8 은 건너뜀)");
    }
  } finally {
    if (courseInserted) await cleanup(db, courseCode);
  }
}

async function cleanup(db, courseCode) {
  try {
    const { error } = await db.from("courses").delete().eq("code", courseCode);
    const { data, error: selectError } = await db.from("courses").select("id").eq("code", courseCode);
    if (error || selectError || (data ?? []).length > 0) {
      fail("정리", `정리 실패 (${error?.message ?? selectError?.message ?? "행이 남아 있음"})`);
    } else {
      pass("정리", "테스트 과정 삭제 확인 (세션·응답·결과는 cascade)");
    }
  } catch (e) {
    fail("정리", `정리 실패 (${e instanceof Error ? e.message : e})`);
  }
}

try {
  await main();
} catch (e) {
  fail("실행 중 예외", e instanceof Error ? e.message : String(e));
}

console.log(`결과: 통과 ${tally.pass} / 실패 ${tally.fail} / 경고 ${tally.warn}`);
// process.exit() 를 바로 부르면 Windows 의 Node 에서 열린 연결 때문에 비정상 종료(127)될 수 있어
// 종료 코드만 정하고 자연스럽게 끝낸다.
process.exitCode = tally.fail > 0 ? 1 : 0;

// 5단계 수동 체크리스트 중 자동화 가능한 항목(c, h, i, j, l)을 한 번에 검증한다.
//
// 실행 전에 앱 서버(npm run dev)가 실행 중이어야 한다.
//   npm run verify:step5
//
// 환경 변수(.env.local 을 --env-file 로 읽는다):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   VERIFY_BASE_URL (기본 http://localhost:3000, localhost / 127.0.0.1 만 허용)
//
// 이 스크립트는 DB 에 테스트 전용 과정을 만들고, 끝나면 (실패해도) 지운다.

import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.VERIFY_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const COOKIE_NAME = "jd_session";
const EXPECTED_KEYS = ["adjectives", "currentStep", "general", "status"];
const TYPE_LETTERS = new Set(["R", "I", "A", "S", "E", "C"]);

const tally = { pass: 0, fail: 0, warn: 0 };

function pass(label, detail) {
  tally.pass++;
  console.log(`✓ ${label} — ${detail}`);
}
function fail(label, reason) {
  tally.fail++;
  console.log(`✗ ${label} — ${reason}`);
}
function warn(label, detail) {
  tally.warn++;
  console.log(`! ${label} — ${detail}`);
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

function randomCourseCode() {
  return randomBytes(18).toString("base64url"); // 24자, [A-Za-z0-9_-]
}

function randomDigits(length) {
  return Array.from({ length }, () => randomInt(0, 10)).join("");
}

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

function request(path, { method = "GET", cookie, body, redirect = "manual" } = {}) {
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
    redirect,
    signal: AbortSignal.timeout(20000),
  });
}

async function responseRows(db, sessionId, itemId) {
  const { data, error } = await db
    .from("responses")
    .select("item_id, value")
    .eq("session_id", sessionId)
    .eq("item_id", itemId);
  if (error) throw new Error(`responses 조회 실패: ${error.message}`);
  return data ?? [];
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

function context(html, index, length = 120) {
  return html.slice(Math.max(0, index - length), index + length).replace(/\s+/g, " ");
}

// 해설 데이터의 특징 문자열: interpretations.json 의 필드명과 유형별 대표 문장.
// (src 의 .ts 는 불러오지 않고 JSON 파일만 읽는다.)
function interpretationMarkers() {
  const data = JSON.parse(readFileSync(new URL("../src/content/interpretations.json", import.meta.url), "utf8"));
  const markers = ["흥미특성", "추천직업", "generalJobs", "seniorJobs", "selfEvaluation", "othersEvaluation", "preferredActivity", "nameKo"];
  for (const t of Object.values(data.types)) {
    markers.push(t.nameKo, t.subtitle, t.interest.slice(0, 20));
  }
  return markers;
}

/**
 * 검사 화면 HTML 을 검사한다.
 * 실패: (1) "type" 키의 값이 R/I/A/S/E/C 단독 문자열, (2) 문항 객체(id g01.. / a01..) 안의 "type" 키,
 *       (3) 해설 데이터 특징 문자열.
 * 경고: 그 밖의 따옴표로 감싼 단독 유형 글자 (Next.js 내부 데이터일 수 있어 문맥만 출력).
 * 제외: "type" 키 자체와 단독 글자는 Next.js 내부 데이터(예: "type":"not-found", "S":true)에도 쓰이므로
 *       값이 RIASEC 인 경우나 문항 객체 안에 있는 경우만 실패로 본다.
 */
function inspectTestHtml(html) {
  const failures = [];
  const warnings = [];

  // 일반 HTML 과 <script> 안의 이스케이프 문자열(\") 을 모두 본다.
  const typeValue = /\\?"type\\?"\s*:\s*\\?"([RIASEC])\\?"/g;
  for (const m of html.matchAll(typeValue)) {
    failures.push(`"type" 키의 값이 유형 글자: ${context(html, m.index, 60)}`);
  }

  const itemWithType = /\{\\?"id\\?"\s*:\s*\\?"[ga]\d\d\\?"[^{}]*?\\?"type\\?"\s*:/g;
  for (const m of html.matchAll(itemWithType)) {
    failures.push(`문항 객체 안에 "type" 키: ${context(html, m.index, 60)}`);
  }

  for (const marker of interpretationMarkers()) {
    const index = html.indexOf(marker);
    if (index !== -1) failures.push(`해설 데이터 문자열 "${marker}" 발견: ${context(html, index, 60)}`);
  }

  for (const letter of TYPE_LETTERS) {
    const standalone = new RegExp(`\\\\?"${letter}\\\\?"`, "g");
    for (const m of html.matchAll(standalone)) {
      warnings.push(`단독 "${letter}": …${context(html, m.index)}…`);
    }
  }
  return { failures, warnings };
}

async function main() {
  assertLocalBase();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.log("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local 확인).");
    process.exit(1);
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const courseCode = randomCourseCode();
  let courseInserted = false;

  try {
    // 준비
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
    const phoneLast4 = randomDigits(4);

    const enter = await request("/api/session/enter", {
      method: "POST",
      body: { courseCode, nickname, phoneLast4, consent: true },
    });
    const cookie = extractSessionCookie(enter);
    if (!cookie) {
      fail("준비. 세션 생성", `쿠키 발급 실패 (enter 응답 ${enter.status})`);
      return;
    }
    pass("준비. 세션 생성", `enter ${enter.status}, 쿠키 발급됨`);

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

    // j. 일반성향 미완료 상태에서 단계 점프 차단
    const jump = await request("/api/session/step", {
      method: "POST",
      cookie,
      body: { courseCode, step: "part1-done" },
    });
    check(jump.status === 409, "j. 단계 점프 차단", "part1-done 요청이 409 로 거부됨", `기대 409, 실제 ${jump.status}`);

    // 응답 저장 기본 동작
    const g01 = await request("/api/session/response", {
      method: "POST",
      cookie,
      body: { courseCode, itemId: "g01", value: true },
    });
    const g01Rows = g01.status === 200 ? await responseRows(db, sessionId, "g01") : [];
    check(
      g01.status === 200 && g01Rows.length === 1 && g01Rows[0].value === true,
      "응답 저장 기본 동작",
      "g01 이 true 로 저장됨",
      g01.status !== 200 ? `기대 200, 실제 ${g01.status}` : `DB 의 g01 행이 true 가 아님 (${JSON.stringify(g01Rows)})`,
    );

    // c. 형용사 선택 후 해제
    const on = await request("/api/session/response", {
      method: "POST",
      cookie,
      body: { courseCode, itemId: "a01", value: true },
    });
    const onRows = on.status === 200 ? await responseRows(db, sessionId, "a01") : [];
    const selectedOk = on.status === 200 && onRows.length === 1;
    check(
      selectedOk,
      "c-1. 형용사 선택",
      "a01 행 생성 확인",
      on.status !== 200 ? `기대 200, 실제 ${on.status}` : "선택 후 DB 에 a01 행이 없음",
    );

    const off = await request("/api/session/response", {
      method: "POST",
      cookie,
      body: { courseCode, itemId: "a01", value: false },
    });
    const offRows = off.status === 200 ? await responseRows(db, sessionId, "a01") : [{ pending: true }];
    check(
      off.status === 200 && offRows.length === 0,
      "c-2. 형용사 해제",
      "행 삭제 확인",
      off.status !== 200 ? `기대 200, 실제 ${off.status}` : "해제 후에도 DB 에 a01 행이 남아 있음",
    );

    // m. 재접속 위치 보정: g01~g03 응답 후 step 을 저장하지 않아도 general-4 로 돌려준다 (읽기 전용 보정)
    let savedAll = g01.status === 200;
    for (const itemId of ["g02", "g03"]) {
      const saved = await request("/api/session/response", {
        method: "POST",
        cookie,
        body: { courseCode, itemId, value: itemId === "g02" },
      });
      savedAll = savedAll && saved.status === 200;
    }
    const resumeResponse = await request(`/api/session/responses?courseCode=${encodeURIComponent(courseCode)}`, { cookie });
    const resumeBody = resumeResponse.status === 200 ? await resumeResponse.json() : null;
    check(
      savedAll && resumeBody?.currentStep === "general-4",
      "m-1. 재접속 위치 보정",
      "g01~g03 응답 + step 미저장 → currentStep 이 general-4",
      !savedAll ? "g02/g03 저장 실패" : `기대 general-4, 실제 ${resumeBody?.currentStep ?? `HTTP ${resumeResponse.status}`}`,
    );
    const { data: stepRow, error: stepError } = await db.from("sessions").select("current_step").eq("id", sessionId).single();
    check(
      !stepError && stepRow.current_step === "general-1",
      "m-2. 보정은 읽기 전용",
      "조회 후에도 DB current_step 이 general-1 그대로",
      stepError ? stepError.message : `DB current_step 이 ${stepRow.current_step} 로 바뀜`,
    );

    // h. 민감한 값 노출 없음
    const query = `/api/session/responses?courseCode=${encodeURIComponent(courseCode)}`;
    const snapshot = await request(query, { cookie });
    const snapshotText = await snapshot.text();
    if (snapshot.status !== 200) {
      fail("h. 민감한 값 노출 없음", `기대 200, 실제 ${snapshot.status}`);
    } else {
      const leaked = ["token", "token_hash", "phone_key"].filter((word) => snapshotText.includes(word));
      let parsed = null;
      try {
        parsed = JSON.parse(snapshotText);
      } catch {
        // 아래에서 실패 처리
      }
      if (leaked.length > 0) {
        fail("h. 민감한 값 노출 없음", `응답에 ${leaked.join(", ")} 포함`);
      } else if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        fail("h. 민감한 값 노출 없음", "응답이 JSON 객체가 아님");
      } else {
        const extras = Object.keys(parsed).filter((k) => !EXPECTED_KEYS.includes(k));
        const missing = EXPECTED_KEYS.filter((k) => !(k in parsed));
        if (missing.length > 0) {
          fail("h. 민감한 값 노출 없음", `필요한 키 없음: ${missing.join(", ")}`);
        } else if (extras.length === 0) {
          pass("h. 민감한 값 노출 없음", "금지 문자열 없음, 키는 status/currentStep/general/adjectives 뿐");
        } else if (extras.length === 1 && extras[0] === "sessionId") {
          warn("h. 민감한 값 노출 없음", "sessionId 포함됨 (확인 필요)");
        } else {
          fail("h. 민감한 값 노출 없음", `명세 밖의 키: ${extras.join(", ")}`);
        }
      }
    }

    // i. 다른 과정 코드로 호출 시 차단
    const other = await request(`/api/session/responses?courseCode=${randomCourseCode()}`, { cookie });
    check(other.status === 401, "i. 다른 과정 코드 차단", "다른 과정 코드 호출이 401 로 거부됨", `기대 401, 실제 ${other.status}`);

    // l. 유형 글자 노출 없음
    let typeLeakInJson = [];
    try {
      typeLeakInJson = collectStrings(JSON.parse(snapshotText)).filter((s) => TYPE_LETTERS.has(s));
    } catch {
      // h 에서 이미 실패로 기록됨
    }
    check(
      typeLeakInJson.length === 0,
      "l-1. 응답 JSON 에 유형 글자 없음",
      "R/I/A/S/E/C 단독 값 없음",
      `유형 글자 값 발견: ${typeLeakInJson.join(", ")}`,
    );

    const page = await request(`/c/${courseCode}/test`, { cookie });
    const html = await page.text();
    if (page.status !== 200 || !/전체[\s\S]{0,60}42/.test(html)) {
      // 리다이렉트되었거나 검사 화면이 아니면 "없음" 판정이 무의미하다.
      fail("l-2. 검사 화면 HTML 에 유형 글자 없음", `검사 화면을 받지 못함 (HTTP ${page.status})`);
    } else {
      const { failures, warnings } = inspectTestHtml(html);
      check(
        failures.length === 0,
        "l-2. 검사 화면 HTML 에 유형·해설 노출 없음",
        `HTML ${html.length}자 검사 (실패 규칙: "type" 값이 R/I/A/S/E/C, 문항 객체 안의 "type", 해설 문자열)`,
        failures.join(" | "),
      );
      for (const w of warnings) warn("l-2. 단독 유형 글자 (Next 내부 데이터인지 확인)", w);
      console.log(
        '  제외한 패턴: "type" 키 자체(예 "type":"not-found")와 따옴표 단독 글자(예 "S":true)는 Next.js 내부 데이터에도 쓰여 ' +
          "실패로 보지 않고, 단독 글자는 위처럼 문맥을 경고로만 출력한다. " +
          '"type" 값이 유형 글자이거나 문항 객체 안에 있을 때만 실패다.',
      );
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
      pass("정리", "테스트 과정 삭제 확인 (세션·응답은 cascade)");
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
process.exit(tally.fail > 0 ? 1 : 0);

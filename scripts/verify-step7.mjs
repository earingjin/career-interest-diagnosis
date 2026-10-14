// 7단계(결과 화면과 A4 결과지)를 검증한다.
//
// 실행 전에 다음이 필요하다.
//   1. 6단계 마이그레이션(20261015000000_submit_and_save.sql)이 DB 에 적용되어 있을 것
//   2. 앱 서버(npm run dev)가 실행 중일 것
//   npm run verify:step7
//
// 환경 변수(.env.local 을 --env-file 로 읽는다):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   VERIFY_BASE_URL (기본 http://localhost:3000, localhost / 127.0.0.1 만 허용)
//
// 이 스크립트는 DB 에 테스트 전용 과정 2개(제출용, 다른 과정 확인용)를 만들고, 끝나면 (실패해도) 지운다.

import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE = (process.env.VERIFY_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const COOKIE_NAME = "jd_session";
const TYPES = ["R", "I", "A", "S", "E", "C"];
const FORBIDDEN_WORDS = ["token", "token_hash", "phone_key", "sessionId"];
const GROUP_TITLES = ["나의 흥미", "나의 활동", "나의 역량", "나의 성향"];

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

const randomCourseCode = () => randomBytes(18).toString("base64url");
const randomDigits = (length) => Array.from({ length }, () => randomInt(0, 10)).join("");
const pad2 = (n) => String(n).padStart(2, "0");
const readJsonFile = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));

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

function request(path, { method = "GET", cookie, body, timeout = 60000 } = {}) {
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
    signal: AbortSignal.timeout(timeout),
  });
}

/** 페이지를 받아 상태, HTML, 스크립트를 뺀 HTML, 리다이렉트 대상을 돌려준다. */
async function getPage(path, cookie) {
  const response = await request(path, { cookie });
  const html = await response.text();
  const markup = html.replace(/<script[\s\S]*?<\/script>/g, "");
  return { status: response.status, html, markup, redirect: redirectTarget(response, html) };
}

/**
 * 리다이렉트 대상. Next 는 스트리밍 중의 redirect 를 HTTP 307 대신
 * <meta http-equiv="refresh"> 와 NEXT_REDIRECT 로 내보내므로 모두 확인한다.
 */
function redirectTarget(response, html) {
  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400 && location) return new URL(location, BASE).pathname;
  const meta = /<meta[^>]+http-equiv="refresh"[^>]+content="[^"]*?url=([^"]+)"/i.exec(html);
  if (meta) return meta[1];
  const flight = /NEXT_REDIRECT;(?:replace|push);([^;"\\]+)/.exec(html);
  return flight ? flight[1] : null;
}

const count = (text, needle) => text.split(needle).length - 1;

async function main() {
  assertLocalBase();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.log("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local 확인).");
    process.exit(1);
  }
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const questions = readJsonFile("../src/content/questions.json");
  const interpretations = readJsonFile("../src/content/interpretations.json");

  const courseCode = randomCourseCode();
  const otherCourseCode = randomCourseCode();
  const insertedCodes = [];

  try {
    // 준비: 과정 2개
    for (const [code, name] of [
      [courseCode, "자동검증 과정"],
      [otherCourseCode, "다른 과정"],
    ]) {
      const { error } = await db.from("courses").insert({ code, name });
      insertedCodes.push(code);
      if (error) {
        fail("준비. 과정 생성", error.message);
        return;
      }
    }

    const nickname = `검증${randomDigits(4)}`;
    const enter = await request("/api/session/enter", {
      method: "POST",
      body: { courseCode, nickname, phoneLast4: randomDigits(4), consent: true },
    });
    const cookie = extractSessionCookie(enter);
    if (!cookie) {
      fail("준비. 세션 생성", `쿠키 발급 실패 (enter 응답 ${enter.status})`);
      return;
    }
    const { data: courseRow } = await db.from("courses").select("id").eq("code", courseCode).single();
    const { data: sessionRow, error: sessionError } = await db
      .from("sessions")
      .select("id")
      .eq("course_id", courseRow.id)
      .eq("nickname", nickname)
      .single();
    if (sessionError) {
      fail("준비. 세션 조회", sessionError.message);
      return;
    }
    const sessionId = sessionRow.id;
    pass("준비. 세션 생성", `enter ${enter.status}, 쿠키 발급됨`);

    // r1. 제출 전: 결과 페이지는 검사 화면으로 보낸다
    const before = await getPage(`/c/${courseCode}/result`, cookie);
    check(
      before.redirect === `/c/${courseCode}/test` && !before.markup.includes(nickname),
      "r1. 제출 전 결과 페이지 차단",
      `${before.status} → ${before.redirect}`,
      `redirect 대상이 /c/${courseCode}/test 가 아님 (status ${before.status}, 대상 ${before.redirect})`,
    );

    // 준비: 사회형(S)·진취형(E)이 높게 나오도록 응답하고 제출한다.
    //   일반성향 S 7 + E 6 + C 3 개를 "예", 형용사 S 3 + E 2 개 선택 → S 10, E 8, C 3
    const trueGeneral = new Set([
      ...questions.general.filter((q) => q.type === "S").slice(0, 7).map((q) => q.id),
      ...questions.general.filter((q) => q.type === "E").slice(0, 6).map((q) => q.id),
      ...questions.general.filter((q) => q.type === "C").slice(0, 3).map((q) => q.id),
    ]);
    const adjectives = [
      ...questions.adjectives.filter((q) => q.type === "S").slice(0, 3),
      ...questions.adjectives.filter((q) => q.type === "E").slice(0, 2),
    ].map((q) => q.id);

    const failedSaves = [];
    const save = async (itemId, value) => {
      const r = await request("/api/session/response", { method: "POST", cookie, body: { courseCode, itemId, value } });
      if (r.status !== 200) failedSaves.push(`${itemId}:${r.status}`);
    };
    for (const q of questions.general) await save(q.id, trueGeneral.has(q.id));
    for (const id of adjectives) await save(id, true);
    if (failedSaves.length > 0) {
      fail("준비. 응답 저장", `저장 실패: ${failedSaves.slice(0, 5).join(", ")} (6단계 마이그레이션 적용 확인)`);
      return;
    }
    const submit = await request("/api/session/submit", { method: "POST", cookie, body: { courseCode } });
    if (submit.status !== 200) {
      fail("준비. 제출", `기대 200, 실제 ${submit.status} ${(await submit.text()).slice(0, 200)}`);
      return;
    }
    pass("준비. 제출", "응답 47개 저장 후 제출 200");

    // 6단계에서 저장된 results 행 (r10 에서 변경 여부를 비교한다)
    const selectResult = () =>
      db.from("results").select("*").eq("session_id", sessionId).single().then(({ data, error }) => {
        if (error) throw new Error(`results 조회 실패: ${error.message}`);
        return data;
      });
    const resultBefore = await selectResult();
    const top1Name = interpretations.types[resultBefore.top1].nameKo;
    const top2Name = interpretations.types[resultBefore.top2].nameKo;
    const jobs = resultBefore.job_recommendations.flatMap((entry) => entry.jobs);

    const page = await getPage(`/c/${courseCode}/result`, cookie);

    // r2. 과정명, 닉네임, 1순위 유형명
    const missing = ["자동검증 과정", nickname, top1Name].filter((text) => !page.markup.includes(text));
    check(
      page.status === 200 && missing.length === 0,
      "r2. 결과 내용 표시",
      `과정명, 닉네임, 1순위(${resultBefore.top1} ${top1Name}), 2순위(${resultBefore.top2} ${top2Name})`,
      page.status !== 200 ? `HTTP ${page.status}, redirect ${page.redirect}` : `HTML 에 없음: ${missing.join(", ")}`,
    );

    // r3. 민감한 값 없음 (스크립트 포함 HTML 전체)
    const leaks = FORBIDDEN_WORDS.filter((word) => page.html.includes(word));
    check(
      leaks.length === 0,
      "r3. 민감한 값 노출 없음",
      `HTML ${page.html.length}자에 ${FORBIDDEN_WORDS.join(", ")} 없음`,
      `발견: ${leaks.join(", ")}`,
    );

    // r4. 쿠키 없이 요청 → 과정 안내 페이지로
    const anonymous = await getPage(`/c/${courseCode}/result`);
    check(
      anonymous.redirect === `/c/${courseCode}` &&
        !anonymous.markup.includes(nickname) &&
        !anonymous.markup.includes(top1Name),
      "r4. 쿠키 없는 요청 차단",
      `${anonymous.status} → ${anonymous.redirect}, 결과 내용 없음`,
      `redirect ${anonymous.redirect}, 결과 내용 포함 여부: ${anonymous.markup.includes(nickname)}`,
    );

    // r5. 다른 과정 URL 에 같은 쿠키
    const other = await getPage(`/c/${otherCourseCode}/result`, cookie);
    check(
      other.redirect === `/c/${otherCourseCode}` &&
        !other.markup.includes(nickname) &&
        !other.markup.includes("자동검증 과정") &&
        !other.markup.includes(top1Name),
      "r5. 다른 과정 URL 차단",
      `${other.status} → ${other.redirect}, 결과 내용 없음`,
      `redirect ${other.redirect}, 닉네임 포함 ${other.markup.includes(nickname)}, 1순위명 포함 ${other.markup.includes(top1Name)}`,
    );

    // r6. 인쇄 스타일: HTML 에 @page 와 A4, 연결된 CSS 에 print-color-adjust
    const stylesheetUrls = [...page.html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]);
    let css = "";
    for (const href of stylesheetUrls) {
      const res = await fetch(new URL(href, BASE), { signal: AbortSignal.timeout(20000) });
      css += await res.text();
    }
    const printCssOk = css.includes("print-color-adjust") && css.includes("@media print");
    check(
      page.html.includes("@page") && page.html.includes("A4") && printCssOk,
      "r6. 인쇄 스타일 포함",
      `HTML 에 @page, A4 / 연결된 CSS ${stylesheetUrls.length}개에 @media print, print-color-adjust`,
      `@page ${page.html.includes("@page")}, A4 ${page.html.includes("A4")}, CSS(@media print·print-color-adjust) ${printCssOk}`,
    );

    // r7. 점수표: 6개 유형이 모바일·인쇄 각각 한 번씩, 1·2순위만 강조
    const rows = [...page.markup.matchAll(/data-score-row="([RIASEC])"[^>]*?data-emphasized="(true|false)"/g)].map(
      (m) => ({ type: m[1], emphasized: m[2] === "true" }),
    );
    const perType = Object.fromEntries(TYPES.map((t) => [t, rows.filter((r) => r.type === t).length]));
    const emphasizedTypes = [...new Set(rows.filter((r) => r.emphasized).map((r) => r.type))].sort();
    const expectedEmphasized = [resultBefore.top1, resultBefore.top2].sort();
    check(
      TYPES.every((t) => perType[t] === 2) &&
        rows.filter((r) => r.emphasized).length === 4 &&
        emphasizedTypes.join() === expectedEmphasized.join(),
      "r7. 점수표와 강조",
      `6개 유형 × (모바일 1 + 인쇄 1), 강조 ${emphasizedTypes.join("·")} 만`,
      `유형별 행 수 ${JSON.stringify(perType)}, 강조 ${JSON.stringify(emphasizedTypes)} (기대 ${expectedEmphasized.join("·")})`,
    );

    // r8. 추천직업 10개: 모바일 1회 + 인쇄 1회씩
    const jobCounts = jobs.map((job) => [job, count(page.markup, `>${job}<`)]);
    check(
      jobs.length === 10 && jobCounts.every(([, n]) => n === 2),
      "r8. 추천직업 표시",
      `${jobs.length}개 모두 모바일·인쇄에 한 번씩 (${jobs.join(", ")})`,
      `직업 ${jobs.length}개, 표시 횟수: ${JSON.stringify(jobCounts)}`,
    );

    // r9. 해설 묶음 제목. 1순위·2순위 해설이 모바일과 인쇄에 각각 있으므로 제목당 4회다.
    //     (명세는 2회였지만 한 화면에 1순위와 2순위 해설이 함께 있어 4 = 유형 2 × 화면 2 가 맞다.)
    const titleCounts = GROUP_TITLES.map((title) => [title, count(page.markup, `>${title}<`)]);
    check(
      titleCounts.every(([, n]) => n === 4),
      "r9. 해설 묶음 제목",
      `${GROUP_TITLES.join(", ")} 각 4회 (1·2순위 × 모바일·인쇄)`,
      JSON.stringify(titleCounts),
    );

    // r10. results 행은 6단계에서 저장된 그대로
    const resultAfter = await selectResult();
    check(
      JSON.stringify(resultBefore) === JSON.stringify(resultAfter),
      "r10. results 행 변경 없음",
      "결과 페이지 조회 후에도 results 행이 그대로",
      "results 행이 바뀜",
    );
  } finally {
    await cleanup(db, insertedCodes);
  }
}

async function cleanup(db, codes) {
  // r11. 종료 시 과정 삭제 (세션·응답·결과는 cascade)
  try {
    const { error } = await db.from("courses").delete().in("code", codes);
    const { data, error: selectError } = await db.from("courses").select("id").in("code", codes);
    if (error || selectError || (data ?? []).length > 0) {
      fail("r11. 정리", `정리 실패 (${error?.message ?? selectError?.message ?? "행이 남아 있음"})`);
    } else {
      pass("r11. 정리", `테스트 과정 ${codes.length}개 삭제 확인 (세션·응답·결과는 cascade)`);
    }
  } catch (e) {
    fail("r11. 정리", `정리 실패 (${e instanceof Error ? e.message : e})`);
  }
}

try {
  await main();
} catch (e) {
  fail("실행 중 예외", e instanceof Error ? e.message : String(e));
}

console.log(`결과: 통과 ${tally.pass} / 실패 ${tally.fail} / 경고 ${tally.warn}`);
// process.exit() 를 바로 부르면 Windows 의 Node 에서 열린 연결 때문에 비정상 종료될 수 있어 종료 코드만 정한다.
process.exitCode = tally.fail > 0 ? 1 : 0;

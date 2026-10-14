// 빌드한 앱과 실제 Supabase를 검증한다. 기존 고객 데이터는 변경하지 않는다.
import assert from "node:assert/strict";
import { randomBytes, createHash, createHmac, scryptSync } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PORT = 3107;
const BASE = `http://127.0.0.1:${PORT}`;
const secret = randomBytes(48).toString("base64url");
const password = randomBytes(24).toString("base64url");
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32, { N: 4096, r: 8, p: 1, maxmem: 16 * 1024 * 1024 });
const passwordHash = `scrypt:4096:8:1:${salt.toString("base64url")}:${hash.toString("base64url")}`;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const code = randomBytes(18).toString("base64url");
let courseId;
let server;
let serverLog = "";
let stage = "DB 연결";
let dbConnected = false;
const checks = [];
const check = (name) => { checks.push(name); console.log(`PASS ${name}`); };
const unwrap = ({ data, error }) => { if (error) throw new Error(`테스트 DB 오류: ${error.code}`); return data; };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const post = (path, body, cookie, origin = BASE) => fetch(`${BASE}${path}`, {
  method: "POST", redirect: "manual", headers: {
    "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}),
  }, body: JSON.stringify(body),
});
const tokenAt = (at) => {
  const iat = Math.floor(at / 1000);
  const pv = createHash("sha256").update(passwordHash).digest("hex").slice(0, 32);
  const encoded = Buffer.from(JSON.stringify({ v: 1, iat, exp: iat + 28800, pv })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`jd-admin-session.${encoded}`).digest("base64url");
  return `${encoded}.${signature}`;
};
const tableRows = (html) => [...(html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "").matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]);
const href = (html, label) => {
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    if (m[2] === label) return m[1].match(/href="([^"]+)"/)?.[1].replaceAll("&amp;", "&");
  }
  return null;
};

try {
  // 실제 테이블/관계 조회를 먼저 확인한다. 네트워크 실패 시 테스트 자료를 만들지 않는다.
  unwrap(await db.from("sessions").select("id, courses(name), results(top1, top2)").limit(1));
  dbConnected = true;
  stage = "테스트 자료 생성";
  const course = unwrap(await db.from("courses").insert({ code, name: "관리자목록검증" }).select("id").single());
  courseId = course.id;
  const input = Array.from({ length: 115 }, (_, i) => ({
    course_id: courseId, nickname: i < 2 ? "동명검증" : `목록검증${i}`,
    phone_key: `admin-list-test-${i}`, token_hash: createHash("sha256").update(`${code}:${i}`).digest("hex"),
    status: "submitted", submitted_at: "2000-02-29T03:00:00.123456Z",
  }));
  input.push(...[
    ["자정포함", "submitted", "2000-02-28T15:00:00Z"],
    ["종료직전", "submitted", "2000-02-29T14:59:59.999999Z"],
    ["시작제외", "submitted", "2000-02-28T14:59:59.999999Z"],
    ["종료제외", "submitted", "2000-02-29T15:00:00Z"],
    ["진행제외", "in_progress", null],
  ].map(([nickname, status, submitted_at], i) => ({
    course_id: courseId, nickname, status, submitted_at,
    phone_key: `admin-edge-test-${i}`, token_hash: createHash("sha256").update(`${code}:edge:${i}`).digest("hex"),
  })));
  const sessions = unwrap(await db.from("sessions").insert(input).select("id,nickname,submitted_at"));
  const scores = { R: 0, I: 0, A: 0, S: 7, E: 6, C: 0 };
  const zero = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  unwrap(await db.from("results").insert(sessions.filter((s) => s.nickname !== "목록검증114" && s.nickname !== "진행제외").map((s) => ({
    session_id: s.id, scoring_version: "test-admin", general_scores: scores, adjective_scores: zero,
    totals: scores, top1: "S", top2: "E", job_recommendations: [],
  }))));
  const before = JSON.stringify(unwrap(await db.from("sessions").select("id,status,submitted_at").eq("course_id", courseId).order("id")));
  const resultsBefore = JSON.stringify(unwrap(await db.from("results").select("session_id,totals,top1,top2").in("session_id", sessions.map((s) => s.id)).order("session_id")));
  stage = "서버 시작";
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ADMIN_ID: "verify-operator", ADMIN_PASSWORD_HASH: passwordHash, ADMIN_SESSION_SECRET: secret },
  });
  server.stdout.on("data", (s) => { serverLog += s; });
  server.stderr.on("data", (s) => { serverLog += s; });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error("검증 서버가 시작되지 않았습니다.");
    try { if ((await fetch(`${BASE}/api/health`)).ok) { ready = true; break; } } catch {}
    await delay(250);
  }
  assert(ready, "검증 서버 준비 시간 초과");
  stage = "접근 제한";
  for (const path of ["/admin", "/admin/results?date=2000-02-29", "/admin/results/anything"]) {
    const r = await fetch(`${BASE}${path}`, { redirect: "manual" });
    assert.equal(r.status, 307); assert.equal(new URL(r.headers.get("location"), BASE).pathname, "/admin/login");
  }
  assert.equal((await fetch(`${BASE}/api/admin/results`, { redirect: "manual" })).status, 401);
  for (const cookie of ["jd_session=customer-token", `jd_admin=${tokenAt(Date.now() - 9 * 3600000)}`, `jd_admin=${tokenAt(Date.now())}tampered`]) {
    assert.equal((await fetch(`${BASE}/admin/results`, { redirect: "manual", headers: { cookie } })).status, 307);
  }
  check("실제 HTTP: 직접 접근·고객 쿠키·만료·변조 차단");
  for (const origin of [null, "https://evil.example"]) {
    assert.equal((await post("/api/admin/login", { id: "verify-operator", password }, null, origin)).status, 403);
    assert.equal((await post("/api/admin/logout", {}, null, origin)).status, 403);
  }
  check("로그인·로그아웃 출처 검사");
  const login = await post("/api/admin/login", { id: "verify-operator", password });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=Strict/i); assert.match(setCookie, /Secure/i);
  const cookie = setCookie.split(";")[0];
  check("실제 DB 로그인 및 관리자 쿠키 발급");
  const seen = [];
  let next = "/admin/results?date=2000-02-29";
  let firstHtml;
  let secondHtml;
  for (let i = 0; next && i < 10; i++) {
    const r = await fetch(`${BASE}${next}`, { headers: { cookie } });
    assert.equal(r.status, 200);
    const html = await r.text();
    if (i === 0) firstHtml = html;
    if (i === 1) secondHtml = html;
    assert(!html.includes(process.env.SUPABASE_SERVICE_ROLE_KEY));
    const pageRows = tableRows(html);
    assert(pageRows.length <= 50);
    seen.push(...pageRows);
    next = href(html, "다음");
  }
  assert.equal(next, null);
  assert.equal(seen.length, 117);
  assert.equal(seen.filter((r) => r.includes("동명검증")).length, 2);
  const missing = seen.find((r) => r.includes("목록검증114"));
  assert(missing.includes("결과 없음 · 확인 필요"));
  assert(seen[0].includes("종료직전")); assert(seen.at(-1).includes("자정포함"));
  for (const name of ["시작제외", "종료제외", "진행제외"]) assert(!seen.some((r) => r.includes(name)));
  const firstNames = tableRows(firstHtml).map((r) => r.match(/<td>(.*?)<\/td>/)[1]);
  const previous = href(secondHtml, "이전");
  const previousHtml = await (await fetch(`${BASE}${previous}`, { headers: { cookie } })).text();
  assert.deepEqual(tableRows(previousHtml).map((r) => r.match(/<td>(.*?)<\/td>/)[1]), firstNames);
  check("실제 DB/페이지: 윤일·자정·동명·진행 제외·결과 누락·117명 이전/다음");
  const badHtml = await (await fetch(`${BASE}/admin/results?date=2026-02-29`, { headers: { cookie } })).text();
  assert(badHtml.includes("존재하지 않는 날짜"));
  const empty = await (await fetch(`${BASE}/admin/results?date=1999-01-01`, { headers: { cookie } })).text();
  assert(empty.includes("해당 날짜에 진단을 완료한 고객이 없습니다"));
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const defaultHtml = await (await fetch(`${BASE}/admin/results`, { headers: { cookie } })).text();
  assert(defaultHtml.includes(`value="${today}"`));
  check("날짜 오류·빈 목록·한국 오늘 기본값");
  assert.equal(JSON.stringify(unwrap(await db.from("sessions").select("id,status,submitted_at").eq("course_id", courseId).order("id"))), before);
  assert.equal(JSON.stringify(unwrap(await db.from("results").select("session_id,totals,top1,top2").in("session_id", sessions.map((s) => s.id)).order("session_id"))), resultsBefore);
  check("목록 조회 전후 세션·결과 변경 없음");
  const logout = await post("/api/admin/logout", {}, cookie);
  assert.equal(logout.status, 200); assert.match(logout.headers.get("set-cookie"), /jd_admin=;/);
  check("실제 HTTP 로그아웃 쿠키 삭제");
  for (let i = 0; i < 5; i++) assert.equal((await post("/api/admin/login", { id: "verify-operator", password: "wrong" })).status, 401);
  assert.equal((await post("/api/admin/login", { id: "verify-operator", password })).status, 429);
  check("실제 DB 로그인 실패 제한");
  if (process.env.VERIFY_CUSTOMER_REGRESSION === "1") {
    stage = "고객 기능 회귀";
    for (const script of ["verify-step5.mjs", "verify-step6.mjs", "verify-step7.mjs"]) {
      const run = spawnSync(process.execPath, [`scripts/${script}`], {
        windowsHide: true, encoding: "utf8", timeout: 60000,
        env: { ...process.env, VERIFY_BASE_URL: `http://localhost:${PORT}` },
      });
      process.stdout.write(run.stdout ?? "");
      assert.equal(run.status, 0, `고객 회귀 검사 실패: ${script}`);
    }
    check("기존 고객 진단·제출·결과 조회 회귀");
  }
  console.log(`${checks.length}개 실제 DB/HTTP 검증 통과`);
} catch (error) {
  // 비밀키나 응답 전체는 출력하지 않는다.
  console.error(`${stage}: ${error instanceof Error ? error.message : "검증 실패"}`);
  if (serverLog.includes("EADDRINUSE")) console.error(`포트 ${PORT}가 사용 중입니다.`);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) { server.kill(); await new Promise((resolve) => server.once("exit", resolve)); }
  if (courseId) {
    const { error } = await db.from("courses").delete().eq("id", courseId).eq("code", code);
    if (error) { console.error("테스트 과정 정리 실패"); process.exitCode = 1; }
  }
  const key = (label) => createHmac("sha256", secret).update(`admin-login:${label}`).digest("hex");
  if (dbConnected) {
    const { error } = await db.from("auth_attempts").delete().in("attempt_key", [key("account"), key("ip:127.0.0.1"), key("ip:unknown")]);
    if (error) { console.error("테스트 로그인 기록 정리 실패"); process.exitCode = 1; }
  }
}

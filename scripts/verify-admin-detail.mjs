// 관리자 결과 상세와 PC A4 인쇄를 실제 DB, 실제 서버, 실제 Chrome 으로 검증한다.
//
// 준비: npm run build 를 먼저 실행해 두어야 한다 (빌드한 앱을 3108 포트로 직접 띄운다).
// 실행: node --env-file=.env.local scripts/verify-admin-detail.mjs
//
// 하는 일 (테스트 전용 과정 1개와 그 아래 자료를 만들고 끝나면 지운다. 고객 데이터는 건드리지 않는다)
//   1. 상세 URL 접근 제한 (인증 없음, 고객 쿠키만, 만료, 변조)
//   2. 동명 세션 구분, 완료·미완료·결과 누락·결과 손상·없는 세션·잘못된 ID 안내
//   3. 실제 고객 흐름으로 만든 전체 결과 내용은 같고 출력은 관리자에게만 제공되는지
//   4. Chrome 으로 인쇄 미디어를 켜고, 1·2순위 30가지 조합 모두에서 A4 한 장에 잘림이 없는지 측정
//      (Chrome 을 찾지 못하면 4번은 "미검증"으로 표시하고 실패로 처리한다)

import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PORT = 3108;
const BASE = `http://127.0.0.1:${PORT}`;
// 고객 API 는 요청 URL 의 호스트(서버가 localhost 로 인식)와 Origin 이 같아야 하므로 고객 흐름은 localhost 로 호출한다.
const CUSTOMER_BASE = `http://localhost:${PORT}`;
const DEBUG_PORT = 9341;
const TYPES = ["R", "I", "A", "S", "E", "C"];
const TYPE_NAME = { R: "현실형", I: "탐구형", A: "예술형", S: "사회형", E: "진취형", C: "관습형" };
const interpretations = JSON.parse(readFileSync(new URL("../src/content/interpretations.json", import.meta.url), "utf8"));
const questions = JSON.parse(readFileSync(new URL("../src/content/questions.json", import.meta.url), "utf8"));

const secret = randomBytes(48).toString("base64url");
const password = randomBytes(24).toString("base64url");
const salt = randomBytes(16);
const passwordHash = `scrypt:4096:8:1:${salt.toString("base64url")}:${scryptSync(password, salt, 32, { N: 4096, r: 8, p: 1, maxmem: 16 * 1024 * 1024 }).toString("base64url")}`;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tally = { pass: 0, fail: 0 };
const pass = (label, detail = "") => { tally.pass++; console.log(`✓ ${label}${detail ? ` — ${detail}` : ""}`); };
const fail = (label, reason) => { tally.fail++; console.log(`✗ ${label} — ${reason}`); };
async function check(label, fn) {
  try { const detail = await fn(); pass(label, detail); } catch (error) { fail(label, error instanceof Error ? error.message : String(error)); }
}
const unwrap = ({ data, error }) => { if (error) throw new Error(`DB 오류: ${error.code ?? error.message}`); return data; };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

function tokenAt(at) {
  const iat = Math.floor(at / 1000);
  const pv = createHash("sha256").update(passwordHash).digest("hex").slice(0, 32);
  const encoded = Buffer.from(JSON.stringify({ v: 1, iat, exp: iat + 28800, pv })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`jd-admin-session.${encoded}`).digest("base64url");
  return `${encoded}.${signature}`;
}

const page = (path, cookie) => fetch(`${BASE}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
const markupOf = (html) => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
const emphasizedTypes = (html) =>
  [...markupOf(html).matchAll(/data-score-row="([RIASEC])"[^>]*?data-emphasized="true"/g)].map((m) => m[1]).filter((t, i, a) => a.indexOf(t) === i).sort();
const textOf = (html) => markupOf(html).replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, "\n").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\n\s*/g, "\n").trim();
// 고객·관리자 화면에서 A4 결과지(제목 ~ 하단 문구)의 글자만 잘라 비교한다.
const sheetText = (html) => {
  const text = textOf(html);
  const start = text.indexOf("직업선호도 검사 결과");
  const endMarker = "기관명 · 문의처 자리";
  const end = text.indexOf(endMarker);
  assert(start >= 0 && end > start, "A4 결과지 영역을 찾지 못함");
  return text.slice(start, end + endMarker.length);
};

/** 선택 직업을 selectJobs 와 같은 규칙(고령자 목록 먼저, 이름 중복 제거, 유형당 5개)으로 만든다. 인쇄 폭 측정용. */
function jobsFor(top1, top2) {
  const used = new Set();
  return [top1, top2].map((type) => {
    const jobs = [];
    for (const name of [...interpretations.types[type].seniorJobs, ...interpretations.types[type].generalJobs]) {
      if (jobs.length >= 5) break;
      if (used.has(name.trim())) continue;
      used.add(name.trim());
      jobs.push(name.trim());
    }
    return { type, jobs, count: jobs.length };
  });
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}

async function cdpSession(chromePath, profileDir) {
  const chrome = spawn(chromePath, [
    "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profileDir}`,
    "--disable-gpu", "--no-first-run", "--window-size=1280,1400", "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === "page"); } catch { /* 아직 시작 중 */ }
    if (!target) await delay(250);
  }
  if (!target) { chrome.kill(); throw new Error("Chrome 원격 디버깅에 연결하지 못했습니다."); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve); ws.addEventListener("error", reject); });
  let id = 0;
  const waiting = new Map();
  const consoleErrors = [];
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); return; }
    if (d.method === "Runtime.exceptionThrown") consoleErrors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") consoleErrors.push(d.params.args.map((a) => a.value ?? a.description).join(" "));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    waiting.set(i, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`스크립트 오류: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  return { send, evaluate, consoleErrors, close: () => { try { ws.close(); } catch { /* 이미 닫힘 */ } chrome.kill(); } };
}

// Chrome 안에서 실행해 결과지가 잘리거나 겹치는지 측정한다 (결과를 JSON 으로 돌려준다).
const MEASURE = `(() => {
  const sheet = document.querySelector('[data-print-sheet]');
  if (!sheet) return { error: '결과지를 찾지 못함' };
  const s = sheet.getBoundingClientRect();
  const problems = [];
  const eps = 0.75;
  let minFont = Infinity;
  for (const el of sheet.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.bottom > s.bottom + eps) problems.push('아래로 넘침: ' + el.tagName + ' ' + (el.textContent || '').slice(0, 20));
    if (r.right > s.right + eps) problems.push('오른쪽으로 넘침: ' + el.tagName + ' ' + (el.textContent || '').slice(0, 20));
    if (r.left < s.left - eps) problems.push('왼쪽으로 넘침: ' + el.tagName);
    if (!(el instanceof SVGElement) && el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      minFont = Math.min(minFont, parseFloat(getComputedStyle(el).fontSize));
    }
  }
  const [header, columns, scores, footer] = sheet.children;
  const colEls = [...columns.children];
  let columnsBottom = 0;
  for (const col of colEls) for (const el of col.querySelectorAll('*')) columnsBottom = Math.max(columnsBottom, el.getBoundingClientRect().bottom);
  const scoresTop = scores.getBoundingClientRect().top;
  if (columnsBottom > scoresTop + eps) problems.push('두 열의 내용이 점수표와 겹침');
  for (const col of colEls) if (col.scrollHeight > col.clientHeight + 1) problems.push('열 내용이 칸보다 김');
  if (sheet.scrollHeight > sheet.clientHeight + 1) problems.push('결과지 내용이 결과지보다 김');
  const headerBottom = header.getBoundingClientRect().bottom;
  if (columns.getBoundingClientRect().top < headerBottom - eps) problems.push('헤더와 본문이 겹침');
  const toolbar = document.querySelector('[data-admin-chrome]');
  return {
    width: s.width, height: s.height, minFont, problems,
    spare: Math.round((scoresTop - columnsBottom) * 10) / 10,
    footerBottomGap: Math.round((s.bottom - footer.getBoundingClientRect().bottom) * 10) / 10,
    toolbarDisplay: toolbar ? getComputedStyle(toolbar).display : 'none-element',
    bodyScrollHeight: document.documentElement.scrollHeight,
  };
})()`;

let server;
let courseId;
let chromeSession;
const ctx = {};

try {
  const course = unwrap(await db.from("courses").insert({ code: randomBytes(18).toString("base64url"), name: "관리자상세검증" }).select("id, code").single());
  courseId = course.id;
  ctx.courseCode = course.code;

  // 직접 만든 세션들: 상세 화면은 sessions/results 만 읽으므로 응답 행은 필요 없다.
  const zero = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  let seq = 0;
  const makeSession = async (nickname, status, submittedAt, result) => {
    seq++;
    const s = unwrap(await db.from("sessions").insert({
      course_id: courseId, nickname, status, submitted_at: submittedAt,
      phone_key: `admin-detail-${seq}`, token_hash: createHash("sha256").update(`${course.code}:${seq}`).digest("hex"),
    }).select("id").single());
    if (result) unwrap(await db.from("results").insert({ session_id: s.id, scoring_version: "test-detail", ...result }));
    return s.id;
  };
  const resultFor = (top1, top2) => {
    const general = { ...zero, [top1]: 7, [top2]: 6 };
    return { general_scores: general, adjective_scores: { ...zero }, totals: general, top1, top2, job_recommendations: jobsFor(top1, top2) };
  };
  ctx.same1 = await makeSession("동명상세", "submitted", "2000-02-29T03:00:00.000000Z", resultFor("S", "E"));
  ctx.same2 = await makeSession("동명상세", "submitted", "2000-02-29T05:30:00.000000Z", resultFor("R", "I"));
  ctx.progress = await makeSession("진행상세", "in_progress", null, null);
  ctx.noResult = await makeSession("결과누락", "submitted", "2000-02-29T06:00:00.000000Z", null);
  // 손상된 결과: 합계가 일반성향 + 형용사 점수와 다르다 (DB 제약은 통과한다)
  ctx.corrupt = await makeSession("결과손상", "submitted", "2000-02-29T07:00:00.000000Z", { ...resultFor("S", "E"), totals: { ...zero, S: 1 } });

  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    windowsHide: true, stdio: "ignore",
    env: { ...process.env, ADMIN_ID: "verify-operator", ADMIN_PASSWORD_HASH: passwordHash, ADMIN_SESSION_SECRET: secret },
  });
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    if (server.exitCode !== null) throw new Error("검증 서버가 시작되지 않았습니다 (npm run build 를 먼저 실행했는지, 3108 포트가 비어 있는지 확인).");
    try { ready = (await fetch(`${BASE}/api/health`)).ok; } catch { /* 시작 중 */ }
    if (!ready) await delay(250);
  }
  assert(ready, "검증 서버 준비 시간 초과");
  const adminCookie = `jd_admin=${tokenAt(Date.now())}`;

  // 1. 접근 제한
  await check("1. 상세 URL 접근 제한 (인증 없음·고객 쿠키만·만료·변조)", async () => {
    const path = `/admin/results/${ctx.same1}`;
    const cases = {
      "인증 없음": undefined,
      "고객 쿠키만": "jd_session=customer-token",
      "만료": `jd_admin=${tokenAt(Date.now() - 9 * 3600000)}`,
      "변조": `${adminCookie}tampered`,
      "고객 쿠키 값을 관리자 쿠키 이름에": "jd_admin=customer-token",
    };
    for (const [name, cookie] of Object.entries(cases)) {
      const r = await page(path, cookie);
      assert.equal(r.status, 307, `${name}: 기대 307, 실제 ${r.status}`);
      assert.equal(new URL(r.headers.get("location"), BASE).pathname, "/admin/login", name);
      assert(!(await r.text()).includes("동명상세"), `${name}: 결과가 노출됨`);
    }
    return `${Object.keys(cases).length}가지 모두 307 → /admin/login, 내용 노출 없음`;
  });

  // 2. 동명 세션과 상태별 처리
  await check("2-1. 동일 닉네임 두 세션을 세션 ID 로 구분", async () => {
    const a = await (await page(`/admin/results/${ctx.same1}`, adminCookie)).text();
    const b = await (await page(`/admin/results/${ctx.same2}`, adminCookie)).text();
    assert(a.includes("동명상세") && b.includes("동명상세"));
    assert.deepEqual(emphasizedTypes(a), ["E", "S"]);
    assert.deepEqual(emphasizedTypes(b), ["I", "R"]);
    return "첫 세션 1·2순위 S·E, 둘째 세션 R·I";
  });

  await check("2-2. 목록 → 상세 연결 (목록의 링크가 세션 ID 주소를 가리킴)", async () => {
    const html = await (await page("/admin/results?date=2000-02-29", adminCookie)).text();
    for (const id of [ctx.same1, ctx.same2, ctx.noResult, ctx.corrupt]) {
      assert(html.includes(`href="/admin/results/${id}"`), `링크 없음: ${id}`);
    }
    assert(!html.includes(`href="/admin/results/${ctx.progress}"`), "미완료 세션이 목록에 있음");
    const detail = await (await page(`/admin/results/${ctx.same2}`, adminCookie)).text();
    assert(detail.includes("/admin/results?date=2000-02-29"), "목록 복귀 링크가 완료 날짜(한국 시간)가 아님");
    return "동명 두 세션이 서로 다른 링크, 상세에서 같은 날짜 목록으로 복귀";
  });

  await check("2-3. 미완료·결과 누락·결과 손상·없는 세션·잘못된 ID 안내", async () => {
    const expectNotice = async (id, text) => {
      const r = await page(`/admin/results/${id}`, adminCookie);
      const html = await r.text();
      assert.equal(r.status, 200);
      assert(html.includes(text), `${id}: 안내 문구 없음 (${text})`);
      assert(!html.includes("data-print-sheet"), `${id}: 결과지가 표시됨`);
    };
    await expectNotice(ctx.progress, "아직 진단을 완료하지 않은 고객");
    await expectNotice(ctx.noResult, "저장된 결과가 없어요");
    await expectNotice(ctx.corrupt, "저장된 결과 데이터가 올바르지 않아요");
    await expectNotice("00000000-0000-4000-8000-0000000000ff", "해당 고객을 찾을 수 없어요");
    await expectNotice("not-a-uuid", "주소가 올바르지 않아요");
    await expectNotice(encodeURIComponent("동명상세"), "주소가 올바르지 않아요");
    return "6가지 모두 안내 문구 표시, 결과지 없음";
  });

  // 3. 실제 고객 흐름으로 만든 결과가 고객 화면과 관리자 상세에서 같은지
  await check("3. 고객 웹 결과와 관리자 출력의 전체 내용 일치·고객 출력 제한", async () => {
    const post = (path, body, cookie) => fetch(`${CUSTOMER_BASE}${path}`, {
      method: "POST", headers: { Origin: CUSTOMER_BASE, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body),
    });
    const enter = await post("/api/session/enter", { courseCode: ctx.courseCode, nickname: `고객${randomDigits(4)}`, phoneLast4: randomDigits(4), consent: true });
    assert.equal(enter.status, 200, "고객 진입 실패");
    const customerCookie = `jd_session=${/jd_session=([^;]+)/.exec(enter.headers.getSetCookie().join("\n"))[1]}`;
    const yes = new Set([
      ...questions.general.filter((q) => q.type === "A").slice(0, 7).map((q) => q.id),
      ...questions.general.filter((q) => q.type === "I").slice(0, 5).map((q) => q.id),
      ...questions.general.filter((q) => q.type === "C").slice(0, 3).map((q) => q.id),
    ]);
    for (const q of questions.general) assert.equal((await post("/api/session/response", { courseCode: ctx.courseCode, itemId: q.id, value: yes.has(q.id) }, customerCookie)).status, 200);
    for (const q of [...questions.adjectives.filter((a) => a.type === "A").slice(0, 3), ...questions.adjectives.filter((a) => a.type === "I").slice(0, 2)]) {
      assert.equal((await post("/api/session/response", { courseCode: ctx.courseCode, itemId: q.id, value: true }, customerCookie)).status, 200);
    }
    assert.equal((await post("/api/session/submit", { courseCode: ctx.courseCode }, customerCookie)).status, 200, "고객 제출 실패");
    const { id } = unwrap(await db.from("sessions").select("id").eq("course_id", courseId).like("nickname", "고객%").single());

    const customerHtml = await (await fetch(`${CUSTOMER_BASE}/c/${ctx.courseCode}/result`, { redirect: "manual", headers: { cookie: customerCookie } })).text();
    const adminHtml = await (await page(`/admin/results/${id}`, adminCookie)).text();
    const customerText = textOf(customerHtml);
    const adminSheet = sheetText(adminHtml);
    const result = unwrap(await db.from("results").select("*").eq("session_id", id).single());
    const expected = ["예술형", "탐구형", ...result.job_recommendations.flatMap((entry) => entry.jobs)];
    for (const type of [result.top1, result.top2]) {
      const section = interpretations.types[type];
      for (const key of ["nameKo", "nameEn", "subtitle", "interest", "value", "preferredActivity", "avoidedActivity", "aptitude", "selfEvaluation", "personality", "othersEvaluation"]) expected.push(section[key]);
    }
    for (const text of expected) {
      assert(customerText.includes(text), "고객 결과 내용 누락: " + text);
      assert(adminSheet.includes(text), "관리자 결과 내용 누락: " + text);
    }
    assert(!markupOf(customerHtml).includes("data-print-sheet"));
    assert(!/PDF|인쇄|A4/.test(customerText));
    assert(!markupOf(adminHtml).includes("님의 검사 결과"));
    // A real submitted customer cookie cannot access the same session's admin print page.
    assert.equal((await page(`/admin/results/${id}`, customerCookie)).status, 307);
    return `동일 결과의 해석·추천직업 ${expected.length}개 확인, 고객 A4 없음, 관리자 출력 유지`;

  });

  // 4. 실제 Chrome 인쇄 측정
  const chromePath = findChrome();
  if (!chromePath) {
    fail("4. 실제 Chrome 인쇄 측정", "미검증: Chrome/Edge 를 찾지 못했습니다 (CHROME_PATH 로 경로를 지정하세요). 인쇄 잘림은 확인되지 않았습니다.");
  } else {
    const pairs = [];
    for (const t1 of TYPES) for (const t2 of TYPES) if (t1 !== t2) pairs.push([t1, t2]);
    const printIds = {};
    for (const [t1, t2] of pairs) {
      printIds[`${t1}${t2}`] = await makeSession(`인쇄${t1}${t2}`, "submitted", "2000-02-29T08:00:00.000000Z", resultFor(t1, t2));
    }

    const profile = `${process.cwd()}/scratch/chrome-profile-detail`;
    chromeSession = await cdpSession(chromePath, profile);
    const { send, evaluate } = chromeSession;
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Network.setCookie", { name: "jd_admin", value: adminCookie.slice("jd_admin=".length), url: BASE, httpOnly: true });
    const go = async (path) => {
      await send("Page.navigate", { url: `${BASE}${path}` });
      for (let i = 0; i < 80; i++) {
        if (await evaluate("!!document.querySelector('[data-print-sheet]')").catch(() => false)) break;
        await delay(150);
      }
      await delay(250);
    };
    const pdfPages = async () => {
      const { data } = await send("Page.printToPDF", { preferCSSPageSize: true, printBackground: true });
      return (Buffer.from(data, "base64").toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    };

    await check("4-1. 화면 미리보기: 결과지 표시, 도구 줄(목록·인쇄 버튼) 표시, 결과지 안에는 버튼 없음", async () => {
      await go(`/admin/results/${printIds.SE}`);
      await send("Emulation.setEmulatedMedia", { media: "screen" });
      const info = await evaluate(`(() => {
        const sheet = document.querySelector('[data-print-sheet]').getBoundingClientRect();
        const tb = document.querySelector('[data-admin-chrome]');
        const button = [...tb.querySelectorAll('button')].find((b) => b.textContent.trim() === '인쇄');
        return { w: sheet.width, h: sheet.height, tb: getComputedStyle(tb).display, hasButton: !!button,
          btnInSheet: document.querySelector('[data-print-sheet]').querySelectorAll('button,a,input').length };
      })()`);
      assert(Math.abs(info.w - 793.7) < 1.5 && Math.abs(info.h - 1118.5) < 1.5, `결과지 크기 ${info.w}x${info.h}`);
      assert.notEqual(info.tb, "none"); assert(info.hasButton); assert.equal(info.btnInSheet, 0);
      return `결과지 ${Math.round(info.w)}x${Math.round(info.h)}px (210x296mm)`;
    });

    await check("4-2. 인쇄 미디어: 도구 줄 숨김, 결과지 210x296mm, PDF 한 장", async () => {
      await go(`/admin/results/${printIds.SE}`);
      await send("Emulation.setEmulatedMedia", { media: "print" });
      await delay(200);
      const m = await evaluate(MEASURE);
      assert.equal(m.toolbarDisplay, "none", "인쇄 때 도구 줄이 보임");
      assert(Math.abs(m.width - 793.7) < 1.5 && Math.abs(m.height - 1118.5) < 1.5, `인쇄 결과지 크기 ${m.width}x${m.height}`);
      assert.equal(await pdfPages(), 1, "PDF 가 한 장이 아님");
      return "도구 줄 display:none, 결과지 794x1118px, PDF 1장";
    });

    const worst = [];
    await check("4-3. 1·2순위 30가지 조합 모두 인쇄 시 잘림·겹침·글자 크기(10pt) 이상 없음, PDF 한 장", async () => {
      const bad = [];
      for (const [t1, t2] of pairs) {
        await go(`/admin/results/${printIds[`${t1}${t2}`]}`);
        await send("Emulation.setEmulatedMedia", { media: "print" });
        await delay(150);
        const m = await evaluate(MEASURE);
        const pages = await pdfPages();
        worst.push({ pair: `${t1}${t2}`, spare: m.spare, footer: m.footerBottomGap, minFont: m.minFont });
        const problems = [...(m.problems ?? []), ...(m.error ? [m.error] : [])];
        if (m.toolbarDisplay !== "none") problems.push("도구 줄이 인쇄에 보임");
        if (pages !== 1) problems.push(`PDF ${pages}장`);
        if (m.minFont < 13.3) problems.push(`글자 크기 ${m.minFont}px (10pt=13.3px 미만)`);
        if (problems.length) bad.push(`${t1}${t2}: ${[...new Set(problems)].slice(0, 3).join(", ")}`);
      }
      assert.equal(bad.length, 0, bad.slice(0, 5).join(" | "));
      const tightest = worst.reduce((a, b) => (b.spare < a.spare ? b : a));
      return `30개 조합 이상 없음. 가장 빠듯한 조합 ${tightest.pair}: 본문~점수표 여백 ${tightest.spare}px`;
    });
  }

  if (chromeSession) {
    await check("4-5. 브라우저 콘솔 오류 없음 (하이드레이션 오류·스크립트 예외 포함)", async () => {
      assert.equal(chromeSession.consoleErrors.length, 0, chromeSession.consoleErrors.slice(0, 2).join(" | ").slice(0, 300));
      return "상세 화면 수십 회 로드 동안 오류 0건";
    });
    await check("4-4. 측정기 자체 점검: 일부러 긴 문장을 넣으면 잘림·겹침을 감지한다", async () => {
      const { send, evaluate } = chromeSession;
      await send("Emulation.setEmulatedMedia", { media: "print" });
      await evaluate(`(() => {
        const col = document.querySelector('[data-print-sheet]').children[1].children[0];
        const p = document.createElement('p');
        p.textContent = '긴 문장 '.repeat(400);
        col.appendChild(p);
      })()`);
      const m = await evaluate(MEASURE);
      assert(m.problems.length > 0, "넘치는 내용을 넣었는데도 측정기가 문제를 찾지 못함 (측정이 믿을 수 없음)");
      return `감지됨: ${m.problems.slice(0, 2).join(", ")}`;
    });
  }

  await check("5. 검증 후 세션·결과 데이터 변경 없음 (조회만 함)", async () => {
    const rows = unwrap(await db.from("results").select("session_id, totals, top1, top2").eq("session_id", ctx.same1));
    assert.equal(rows.length, 1); assert.equal(rows[0].top1, "S"); assert.equal(rows[0].totals.S, 7);
    const s = unwrap(await db.from("sessions").select("status, submitted_at").eq("id", ctx.progress).single());
    assert.equal(s.status, "in_progress"); assert.equal(s.submitted_at, null);
    return "조회 후에도 그대로";
  });
} catch (error) {
  fail("실행 중 예외", error instanceof Error ? error.message : String(error));
} finally {
  chromeSession?.close();
  if (server && server.exitCode === null) { server.kill(); await new Promise((resolve) => server.once("exit", resolve)); }
  if (courseId) {
    const { error } = await db.from("courses").delete().eq("id", courseId);
    const { data } = await db.from("courses").select("id").eq("id", courseId);
    if (error || (data ?? []).length) fail("정리", "테스트 과정 삭제 실패"); else pass("정리", "테스트 과정과 하위 자료 삭제 확인");
  }
}

console.log(`결과: 통과 ${tally.pass} / 실패 ${tally.fail}`);
process.exitCode = tally.fail > 0 ? 1 : 0;

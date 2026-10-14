// 고객용 홈(/)의 시작 버튼, 기본 과정 처리, 모바일 화면을 실제 Next 서버와 실제 Chrome 으로 검증한다.
//
// 실행: node --env-file=.env.local scripts/verify-home.mjs
//   Next 는 NEXT_PUBLIC_* 값을 빌드할 때 고정하므로, 가짜 DB 구간은 가짜 주소로 빌드한 앱을 쓰고
//   끝나면 실제 설정으로 다시 빌드해 .next 를 원래대로 되돌린다 (빌드 두 번, 몇 분 걸린다).
//   다른 next dev 가 켜져 있어도 상관없다 (개발 서버는 .next/dev 를 쓴다).
//
// A. 가짜 DB 구간: PostgREST 를 흉내 내는 작은 서버에 실제 앱을 연결해, 기본 과정 상태별(활성·비활성·없음·DB 오류) 동작과
//    "홈 → 시작 버튼 클릭 → 참여자 입력·동의 화면" 이동을 확인한다. (실제 DB 를 건드리지 않는다)
// B. 실제 DB 구간: 마이그레이션(20261016000000_course_default.sql) 적용 여부를 확인한다.
//    - 미적용: 홈이 잘못된 곳으로 연결하지 않고 안내만 보여주는지만 확인하고, 나머지는 "미검증"으로 표시한다.
//    - 적용: 지정된 기본 과정이 있으면 읽기 전용으로 확인하고, 없으면 임시 과정을 만들어 확인한 뒤 지운다.
//
// 모바일 화면(360px) 스크린샷은 scratch/ 에 저장한다.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";

const APP_PORT = 3109;
const FAKE_PORT = 54399;
const DEBUG_PORT = 9342;
const APP = `http://localhost:${APP_PORT}`;
mkdirSync("scratch", { recursive: true });

const tally = { pass: 0, fail: 0, unverified: 0 };
const pass = (label, detail = "") => { tally.pass++; console.log(`✓ ${label}${detail ? ` — ${detail}` : ""}`); };
const fail = (label, reason) => { tally.fail++; console.log(`✗ ${label} — ${reason}`); };
const unverified = (label, reason) => { tally.unverified++; console.log(`! 미검증 ${label} — ${reason}`); };
async function check(label, fn) {
  try { pass(label, await fn()); } catch (error) { fail(label, error instanceof Error ? error.message : String(error)); }
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- 가짜 PostgREST ----------
const FAKE_CODE = randomBytes(18).toString("base64url");
const fake = { mode: "ok", requests: [] };
const fakeServer = http.createServer((req, res) => {
  const url = new URL(req.url, "http://fake");
  fake.requests.push(`${req.method} ${url.pathname}?${url.searchParams}`);
  const json = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (url.pathname !== "/rest/v1/courses") return json(404, { code: "PGRST205", message: "unexpected table" });
  const course = { id: "00000000-0000-4000-8000-000000000001", code: FAKE_CODE, name: "프로토타입 진단 과정", is_active: true };
  if (url.searchParams.get("is_default") === "eq.true") {
    if (fake.mode === "error") return json(500, { code: "PGRST000", message: "boom" });
    if (fake.mode === "none") return json(200, []);
    return json(200, [{ ...course, is_active: fake.mode !== "inactive" }]);
  }
  if (url.searchParams.get("code") === `eq.${FAKE_CODE}`) {
    const wantsObject = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    return json(200, wantsObject ? course : [course]);
  }
  return json(200, wantsEmpty(req) ? null : []);
});
const wantsEmpty = (req) => String(req.headers.accept ?? "").includes("vnd.pgrst.object");

// ---------- 빌드와 서버 실행 ----------
let buildIsFake = false;
function buildApp(env, label) {
  const run = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    windowsHide: true, encoding: "utf8", timeout: 600000, env: { ...process.env, ...env },
  });
  if (run.status !== 0) throw new Error(`${label} 빌드 실패: ${(run.stderr || run.stdout || "").slice(-300)}`);
}
function startApp(env) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(APP_PORT)], {
    windowsHide: true, stdio: "ignore", env: { ...process.env, ...env },
  });
  return child;
}
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGKILL");
}
async function waitForApp(child) {
  for (let i = 0; i < 240; i++) {
    if (child.exitCode !== null) throw new Error("서버가 시작되지 않았습니다 (npm run build 를 먼저 실행했는지, 3109 포트가 비어 있는지 확인).");
    try { if ((await fetch(`${APP}/api/health`)).ok) return; } catch { /* 시작 중 */ }
    await delay(500);
  }
  throw new Error("서버 준비 시간 초과");
}

// ---------- Chrome ----------
function findChrome() {
  return [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean).find((p) => existsSync(p)) ?? null;
}
async function openChrome(chromePath) {
  const chrome = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${process.cwd()}/scratch/chrome-profile-home`,
    "--disable-gpu", "--no-first-run", "about:blank"], { stdio: "ignore", windowsHide: true });
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === "page"); } catch { /* 시작 중 */ }
    if (!target) await delay(250);
  }
  if (!target) { chrome.kill(); throw new Error("Chrome 원격 디버깅에 연결하지 못했습니다."); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve); ws.addEventListener("error", reject); });
  let id = 0;
  const waiting = new Map();
  ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } });
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
  const waitFor = async (expression, ms = 90000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await evaluate(expression).catch(() => false)) return true; await delay(200); }
    return false;
  };
  await send("Page.enable"); await send("Runtime.enable");
  const mobile = () => send("Emulation.setDeviceMetricsOverride", { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
  const desktop = () => send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  const go = async (path) => { await send("Page.navigate", { url: `${APP}${path}` }); await waitFor("document.readyState === 'complete'"); };
  const shot = async (file) => {
    const { contentSize } = await send("Page.getLayoutMetrics");
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: contentSize.width, height: contentSize.height, scale: 1 } });
    writeFileSync(file, Buffer.from(data, "base64"));
  };
  return { send, evaluate, waitFor, mobile, desktop, go, shot, close: () => { try { ws.close(); } catch { /* 닫힘 */ } chrome.kill(); } };
}

const MEASURE = `(() => {
  const cta = document.querySelector('[data-start-cta="hero"]');
  const r = cta ? cta.getBoundingClientRect() : null;
  let minFont = Infinity;
  for (const el of document.body.querySelectorAll('*')) {
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) minFont = Math.min(minFont, parseFloat(getComputedStyle(el).fontSize));
  }
  return {
    hasCta: !!cta, href: cta ? cta.getAttribute('href') : null,
    ctaHeight: r ? r.height : 0, ctaBottom: r ? r.bottom : 0, viewportHeight: innerHeight,
    scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, minFont,
    text: document.body.innerText,
    courseLinks: [...document.querySelectorAll('a[href^="/c/"]')].map((a) => a.getAttribute('href')),
    allLinks: [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    controls: document.querySelectorAll('select, input, form').length,
    notice: (document.querySelector('[data-start-notice]') || {}).dataset ? document.querySelector('[data-start-notice]').dataset.startNotice : null,
    ctaCount: document.querySelectorAll('[data-start-cta]').length,
  };
})()`;

const visible = (selector) =>
  `(() => { const e = document.querySelector(${JSON.stringify(selector)}); return !!e && e.getBoundingClientRect().height > 0; })()`;

const FORBIDDEN = ["QR", "과정 선택", "과정을 선택", "관리자", "로그인"];

async function checkHomeStates(chrome, expectedHref) {
  // 홈에 표시된 내용 공통 점검 (모바일)
  await check("홈 화면: 모바일(360px)에서 시작 버튼이 첫 화면에 보이고 크기·글자·가로 넘침이 규칙을 지킨다", async () => {
    await chrome.mobile();
    await chrome.go("/");
    assert(await chrome.waitFor(visible('[data-start-cta="hero"]')), "시작 버튼이 나타나지 않음");
    const m = await chrome.evaluate(MEASURE);
    assert(m.ctaHeight >= 56, `버튼 높이 ${m.ctaHeight}px`);
    assert(m.ctaBottom <= m.viewportHeight, `버튼이 첫 화면 밖 (bottom ${m.ctaBottom} > ${m.viewportHeight})`);
    assert(m.scrollWidth <= m.viewportWidth, `가로 넘침 ${m.scrollWidth} > ${m.viewportWidth}`);
    assert(m.minFont >= 17.9, `18px 미만 글자 ${m.minFont}px`);
    assert.equal(m.ctaCount, 2);
    assert.equal(m.controls, 0, "홈에 입력·선택 요소가 있음");
    for (const word of FORBIDDEN) assert(!m.text.includes(word), `홈에 "${word}" 문구가 있음`);
    assert(m.allLinks.every((h) => h.startsWith("/c/")), `예상 밖 링크: ${m.allLinks}`);
    assert.equal(m.allLinks.length, 2);
    await chrome.shot("scratch/home-mobile.png");
    return `버튼 ${Math.round(m.ctaHeight)}px, 최소 글자 ${m.minFont}px, 가로 넘침 없음`;
  });
  await check("홈 화면: 데스크톱(1280px)에서도 가로 넘침 없이 표시된다", async () => {
    await chrome.desktop();
    await chrome.go("/");
    assert(await chrome.waitFor(visible('[data-start-cta="hero"]')));
    const m = await chrome.evaluate(MEASURE);
    assert(m.scrollWidth <= m.viewportWidth);
    await chrome.shot("scratch/home-desktop.png");
    return "스크린샷 scratch/home-desktop.png";
  });
  await check("시작 버튼을 누르면 실제 참여자 정보 입력·동의 화면으로 이동한다", async () => {
    await chrome.mobile();
    await chrome.go("/");
    assert(await chrome.waitFor(visible('[data-start-cta="hero"]')));
    const m = await chrome.evaluate(MEASURE);
    assert.equal(m.href, expectedHref);
    // 실제 클릭: 버튼 중앙 좌표에 마우스 이벤트를 보낸다.
    const rect = await chrome.evaluate(`(() => { const r = document.querySelector('[data-start-cta="hero"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    for (const type of ["mousePressed", "mouseReleased"]) await chrome.send("Input.dispatchMouseEvent", { type, x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    assert(await chrome.waitFor(`location.pathname === ${JSON.stringify(expectedHref)}`), "주소가 이동하지 않음");
    assert(await chrome.waitFor("!!document.querySelector('#nickname')"), "참여자 입력 화면이 나타나지 않음");
    const form = await chrome.evaluate(`(() => ({
      nickname: !!document.querySelector('#nickname'), phone: !!document.querySelector('#phoneLast4'),
      consent: !!document.querySelector('input[type=checkbox]'),
      startDisabled: document.querySelector('button[type=submit]').disabled,
      text: document.body.innerText,
    }))()`);
    assert(form.nickname && form.phone && form.consent, "입력칸·동의 체크가 없음");
    assert(form.startDisabled, "입력 전에는 시작하기 버튼이 비활성이어야 함");
    assert(form.text.includes("개인정보") && form.text.includes("동의합니다"), "개인정보 안내·동의가 없음");
    return `${expectedHref} → 닉네임·뒷자리·동의·(비활성)시작하기 표시`;
  });
}

async function checkNoticeState(chrome, kind, title) {
  await check(`기본 과정 ${kind}: 어디로도 연결하지 않고 안내만 표시`, async () => {
    await chrome.mobile();
    await chrome.go("/");
    assert(await chrome.waitFor(visible('[data-start-notice]')), "안내가 나타나지 않음");
    const m = await chrome.evaluate(MEASURE);
    assert.equal(m.hasCta, false, "시작 버튼이 표시됨");
    assert.deepEqual(m.courseLinks, [], "과정으로 연결하는 링크가 있음");
    assert.equal(m.notice, kind);
    assert(m.text.includes(title), `안내 문구 없음: ${title}`);
    assert(m.scrollWidth <= m.viewportWidth);
    for (const word of FORBIDDEN) assert(!m.text.includes(word), `"${word}" 문구가 있음`);
    return `"${title}"`;
  });
}

let chrome;
let app;
let courseToClean = null;
try {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("Chrome/Edge 를 찾지 못했습니다 (CHROME_PATH 로 지정하세요). 브라우저 검증은 미검증 상태입니다.");
  chrome = await openChrome(chromePath);

  // ===== A. 가짜 DB 구간 =====
  await new Promise((resolve) => fakeServer.listen(FAKE_PORT, "127.0.0.1", resolve));
  const fakeEnv = { NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${FAKE_PORT}`, SUPABASE_SERVICE_ROLE_KEY: "fake-service-key", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake-anon-key" };
  buildIsFake = true;
  buildApp(fakeEnv, "가짜 DB 주소");
  app = startApp(fakeEnv);
  await waitForApp(app);

  fake.mode = "ok";
  await checkHomeStates(chrome, `/c/${FAKE_CODE}`);

  for (const [mode, title] of [["inactive", "지금은 진단을 진행하고 있지 않아요"], ["none", "지금은 진단을 시작할 수 없어요"], ["error", "잠시 문제가 생겨"]]) {
    fake.mode = mode;
    await checkNoticeState(chrome, mode, title);
  }
  await check("기본 과정 조회는 is_default=true 조건 하나로만 한다 (과정 코드·ID 하드코딩 없음)", async () => {
    const queries = fake.requests.filter((r) => r.includes("is_default"));
    assert(queries.length > 0);
    assert(queries.every((q) => /is_default=eq\.true/.test(q) && !/code=|id=/.test(q)), queries[0]);
    return `${queries.length}회 조회, 모두 is_default=eq.true`;
  });
  fake.mode = "ok";
  await check("상태가 바뀌면 다시 접속했을 때 바로 반영된다 (캐시하지 않음)", async () => {
    fake.mode = "ok";
    await chrome.go("/");
    assert(await chrome.waitFor(visible('[data-start-cta]')));
    fake.mode = "inactive";
    await chrome.go("/");
    assert(await chrome.waitFor(visible('[data-start-notice="inactive"]')), "비활성 상태가 반영되지 않음");
    return "활성 → 비활성 즉시 반영";
  });

  killTree(app);
  await delay(1500);
  await new Promise((resolve) => fakeServer.close(resolve));

  // ===== B. 실제 DB 구간 (실제 설정으로 다시 빌드) =====
  buildApp({}, "실제 설정");
  buildIsFake = false;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const probe = await db.from("courses").select("code, name, is_active, is_default").eq("is_default", true).limit(2);
  app = startApp({});
  await waitForApp(app);

  if (probe.error) {
    // 마이그레이션 전: 홈이 잘못된 곳으로 연결하지 않고 안내하는지만 확인한다.
    await check("실제 DB(마이그레이션 미적용): 홈이 연결하지 않고 안내만 표시", async () => {
      assert(probe.error.code === "42703" || /is_default|column/i.test(probe.error.message), `예상과 다른 DB 오류: ${probe.error.code}`);
      await chrome.mobile();
      await chrome.go("/");
      assert(await chrome.waitFor(visible('[data-start-notice]')));
      const m = await chrome.evaluate(MEASURE);
      assert.equal(m.hasCta, false); assert.deepEqual(m.courseLinks, []);
      return `안내 종류 ${m.notice}`;
    });
    unverified("실제 DB: 기본 과정 연결·비활성 처리·실제 클릭 이동", "20261016000000_course_default.sql 이 실제 DB 에 적용되지 않았습니다. SQL Editor 에서 실행한 뒤 이 스크립트를 다시 실행하세요.");
  } else {
    const existing = probe.data ?? [];
    let expected;
    if (existing.length === 1) {
      expected = existing[0];
      console.log(`  (실제 DB 에 지정된 기본 과정이 있어 읽기 전용으로 확인합니다: 활성=${expected.is_active})`);
    } else if (existing.length === 0) {
      const created = await db.from("courses").insert({ code: randomBytes(18).toString("base64url"), name: "홈검증 임시 과정", is_default: true, is_active: true }).select("id, code, name, is_active").single();
      assert(!created.error, `임시 과정 생성 실패: ${created.error?.message}`);
      courseToClean = created.data.id;
      expected = created.data;
    } else {
      throw new Error("실제 DB 에 기본 과정이 둘 이상 지정되어 있습니다.");
    }
    if (expected.is_active) {
      await checkHomeStates(chrome, `/c/${expected.code}`);
    } else {
      await checkNoticeState(chrome, "inactive", "지금은 진단을 진행하고 있지 않아요");
    }
    if (courseToClean) {
      await db.from("courses").update({ is_active: false }).eq("id", courseToClean);
      await checkNoticeState(chrome, "inactive", "지금은 진단을 진행하고 있지 않아요");
      await db.from("courses").update({ is_default: false, is_active: true }).eq("id", courseToClean);
      await checkNoticeState(chrome, "none", "지금은 진단을 시작할 수 없어요");
    } else {
      unverified("실제 DB: 비활성·없음 상태", "실제 DB 에 이미 지정된 기본 과정이 있어 운영 데이터를 바꾸지 않고 건너뛰었습니다 (가짜 DB 구간에서 검증됨).");
    }
  }
} catch (error) {
  fail("실행 중 예외", error instanceof Error ? error.message : String(error));
} finally {
  chrome?.close();
  killTree(app);
  if (buildIsFake) {
    // 가짜 주소로 빌드된 채 끝나면 안 되므로 실제 설정으로 되돌린다.
    try { buildApp({}, "복구"); console.log("  (가짜 주소 빌드를 실제 설정으로 복구했습니다)"); } catch (e) { fail("빌드 복구", e instanceof Error ? e.message : String(e)); }
  }
  try { fakeServer.close(); } catch { /* 이미 닫힘 */ }
  if (courseToClean) {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    await db.from("courses").delete().eq("id", courseToClean);
    const { data } = await db.from("courses").select("id").eq("id", courseToClean);
    if ((data ?? []).length) fail("정리", "임시 과정 삭제 실패"); else pass("정리", "임시 과정 삭제 확인");
  }
}

console.log(`결과: 통과 ${tally.pass} / 실패 ${tally.fail} / 미검증 ${tally.unverified}`);
process.exitCode = tally.fail > 0 ? 1 : 0;

// 실행: node --env-file=.env.local scripts/verify-mobile.mjs
// Playwright를 설치했거나 PLAYWRIGHT_MODULE에 모듈 진입 파일을 지정해야 한다.
// MOBILE_BASE_URL(로컬만), MOBILE_PHASE(before/after), MOBILE_OUTPUT으로 비교 실행 가능.
// 무작위 테스트 과정만 생성·삭제한다. 운영 기본 과정은 읽기만 한다.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.MOBILE_BASE_URL ?? "http://localhost:3000";
assert(["localhost", "127.0.0.1"].includes(new URL(BASE).hostname));
const phase = process.env.MOBILE_PHASE ?? "after";
const after = phase === "after";
const output = resolve(process.env.MOBILE_OUTPUT ?? `scratch/mobile-ux/${phase}`);
mkdirSync(output, { recursive: true });
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : "playwright");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const code = randomBytes(18).toString("base64url");
const questions = JSON.parse(readFileSync(new URL("../src/content/questions.json", import.meta.url), "utf8"));
const interpretations = JSON.parse(readFileSync(new URL("../src/content/interpretations.json", import.meta.url), "utf8"));
const evidence = { phase, checks: [], screens: [], cleanup: false };
let browser;
let courseId;
const sessionIds = [];
const pass = (label) => { evidence.checks.push(label); console.log(`PASS ${label}`); };

try {
  const { data: course, error } = await db.from("courses").insert({ code, name: "모바일UX자동검증", is_default: false }).select("id").single();
  if (error) throw error;
  courseId = course.id;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  for (const width of [360, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 740 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const textButton = (name) => page.getByRole("button", { name, exact: true });
    const shot = async (name, fullPage = false) => {
      const file = `${width}-${name}.png`;
      await page.screenshot({ path: resolve(output, file), fullPage });
      const metrics = await page.evaluate(() => ({
        viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll("button, input:not([type=checkbox]), summary, a")].filter((e) => e.getBoundingClientRect().height > 0).map((e) => ({ text: e.textContent.trim().slice(0, 40), height: e.getBoundingClientRect().height, font: parseFloat(getComputedStyle(e).fontSize) })),
      }));
      evidence.screens.push({ file, ...metrics });
      assert(metrics.scrollWidth <= width, `${file}: horizontal overflow ${metrics.scrollWidth}`);
      pass(`${width} ${name}: no horizontal overflow`);
    };
    const saved = async () => {
      await page.waitForFunction((code) => JSON.parse(localStorage.getItem(`jd_pending:${code}`) ?? "[]").length === 0, code);
    };
    await page.goto(BASE);
    const start = page.locator('[data-start-cta="hero"]');
    await start.waitFor();
    await shot("01-home", true);
    assert(!/QR|과정 선택/.test(await page.locator("body").innerText()));
    await start.click();
    await page.locator("#nickname").waitFor();
    pass(`${width} home start -> existing entry (no course selection)`);
    // 실제 기본 과정에는 응답을 남기지 않고 독립 테스트 과정에서 이어간다.
    await page.goto(`${BASE}/c/${code}`);
    await page.locator("#nickname").waitFor();
    await shot("02-entry", true);
    await page.locator("#nickname").fill(`모바일${width}`);
    await page.locator("#nickname").press("Enter");
    if (after) assert.equal(await page.locator("#phoneLast4").evaluate((e) => e === document.activeElement), true);
    await page.locator("#phoneLast4").fill("1a2");
    assert.equal(await page.locator("#phoneLast4").inputValue(), "12");
    await page.locator("#phoneLast4").fill("1234");
    if (after) {
      await page.locator("#phoneLast4").press("Enter");
      assert.equal(await page.getByRole("checkbox").evaluate((e) => e === document.activeElement), true);
    }
    assert(await textButton("시작하기").isDisabled());
    await page.getByRole("checkbox").check();
    await textButton("시작하기").click();
    await page.getByRole("progressbar").waitFor();
    await shot("03-general");
    const counter = (n) => page.waitForFunction((n) => document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") === String(n), n);
    const answer = async (n) => {
      await counter(n);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `question ${n} overflow`);
      await textButton(n % 2 ? "예" : "아니요").click();
      if (n < 42) await counter(n + 1);
    };
    for (let n = 1; n <= 3; n++) await answer(n);
    await saved();
    await page.goto(BASE);
    await page.locator('[data-start-cta="hero"]').waitFor();
    await page.goto(`${BASE}/c/${code}`);
    await counter(4);
    pass(`${width} interrupt -> entry -> resume at question 4`);
    // 저장 실패 상태에서도 문항 진행·로컬 복원이 가능하고, 재연결 시 응답 뒤에 step을 전송한다.
    await page.route("**/api/session/response", (route) => route.abort());
    await answer(4);
    await page.getByText("저장되지 않은 응답이 있어요. 연결되면 자동으로 보낼게요", { exact: true }).waitFor();
    await page.reload();
    await counter(5);
    await page.unroute("**/api/session/response");
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await saved();
    pass(`${width} failed save -> reload -> local restore -> reconnect`);
    // 자동 이동 대기 중 이전을 누르면 남은 타이머가 이전 이동을 덮어쓰지 않아야 한다.
    await textButton("예").click();
    await textButton("← 뒤로").click();
    await page.waitForTimeout(400);
    await counter(4);
    await textButton("다음").click();
    await counter(5);
    await textButton("다음").click();
    await counter(6);
    pass(`${width} answer timer + manual previous/next do not double advance`);
    if (after) {
      let delayFirst = true;
      await page.route("**/api/session/response", async (route) => {
        if (delayFirst) {
          delayFirst = false;
          await new Promise((done) => setTimeout(done, 1000));
        }
        await route.continue();
      });
      await textButton("아니요").click();
      await textButton("예").click();
      await counter(7);
      assert(await page.evaluate((code) => JSON.parse(localStorage.getItem(`jd_pending:${code}`) ?? "[]").length > 0, code));
      await saved();
      await page.unroute("**/api/session/response");
      pass(`${width} slow save + changed answer retain latest value without blocking advance`);
    } else await answer(6);
    for (let n = 7; n <= 42; n++) await answer(n);
    await page.getByRole("heading", { name: "일반성향 검사를 모두 마쳤습니다" }).waitFor();
    await textButton("다음").click();
    await textButton("시작하기").click();
    await shot("04-adjectives");
    if (after) {
      assert.equal(await page.locator('[class*="chips"]').evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length), 2);
    }
    for (const q of questions.adjectives) {
      const bounds = await textButton(q.text).boundingBox();
      assert(bounds && bounds.height >= 48 && bounds.width >= 48);
      assert.equal(await textButton(q.text).evaluate((e) => e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight), true, q.text);
    }
    assert(await textButton("다음").isDisabled());
    for (const q of questions.adjectives.slice(0, 4)) await textButton(q.text).click();
    assert(await textButton("다음").isDisabled());
    await textButton(questions.adjectives[4].text).click();
    assert(await textButton("다음").isEnabled());
    await textButton(questions.adjectives[29].text).click();
    await shot("04-adjectives-bottom");
    if (after) {
      const countBox = await page.getByRole("heading", { name: "선택 6개 (최소 5개)" }).boundingBox();
      assert(countBox && countBox.y >= 0 && countBox.y + countBox.height <= 740);
    }
    await textButton(questions.adjectives[29].text).click();
    await saved();
    await page.reload();
    await page.getByRole("heading", { name: "선택 5개 (최소 5개)" }).waitFor();
    for (const q of questions.adjectives.slice(0, 5)) assert.equal(await textButton(q.text).getAttribute("aria-pressed"), "true");
    pass(`${width} all 30 adjectives reachable; minimum 4/5 and deselect/resume`);
    await textButton("다음").click();
    await page.getByRole("heading", { name: "응답을 한 번 더 확인해 주세요" }).waitFor();
    await shot("05-review", true);
    if (after) {
      await page.getByText("일반성향 응답 확인·수정", { exact: true }).click();
      await shot("05-review-expanded");
      await page.getByRole("button", { name: `1. ${questions.general[0].text} 예 · 수정`, exact: true }).click();
      await counter(1);
      await textButton("아니요").click();
      await page.waitForTimeout(400);
      await counter(1);
      await textButton("확인 화면으로").click();
      await textButton("형용사 선택 확인·수정").click();
      await textButton(questions.adjectives[0].text).click();
      assert(await textButton("다음").isDisabled());
      await textButton(questions.adjectives[5].text).click();
      await textButton("다음").click();
      await saved();
      pass(`${width} review -> edit general and adjectives -> review`);
    }
    const { data: session, error: sessionError } = await db.from("sessions").select("id").eq("course_id", courseId).eq("nickname", `모바일${width}`).single();
    if (sessionError) throw sessionError;
    sessionIds.push(session.id);
    const { data: rows, error: rowsError } = await db.from("responses").select("item_id,value").eq("session_id", session.id);
    if (rowsError) throw rowsError;
    assert.equal(rows.filter((r) => r.item_id.startsWith("g")).length, 42);
    assert.equal(rows.filter((r) => r.item_id.startsWith("a")).length, 5);
    const expected = Object.fromEntries(questions.general.map((q, i) => [q.id, (i + 1) % 2 === 1]));
    expected.g05 = true;
    if (after) { expected.g01 = false; expected.g06 = true; }
    for (const row of rows.filter((r) => r.item_id.startsWith("g"))) assert.equal(row.value, expected[row.item_id], row.item_id);
    await textButton("검사 제출하기").click();
    await shot("05-confirm");
    await textButton("아니요, 더 볼게요").click();
    await textButton("검사 제출하기").click();
    await textButton("네, 제출합니다").click();
    await textButton("결과 보기").click();
    await page.getByRole("heading", { name: `모바일${width}님의 검사 결과`, exact: true }).waitFor();
    await shot("06-result", true);
    const getResult = async () => {
      const { data, error } = await db.from("results").select("*").eq("session_id", session.id).single();
      if (error) throw error;
      return data;
    };
    const result = await getResult();
    // UI에서 저장된 응답을 독립 집계해 기존 채점 및 추천직업과 대조한다.
    const generalScores = Object.fromEntries(["R", "I", "A", "S", "E", "C"].map((type) => [type, questions.general.filter((q) => q.type === type && expected[q.id]).length]));
    const selectedIds = rows.filter((r) => r.item_id.startsWith("a") && r.value).map((r) => r.item_id);
    const adjectiveScores = Object.fromEntries(Object.keys(generalScores).map((type) => [type, questions.adjectives.filter((q) => q.type === type && selectedIds.includes(q.id)).length]));
    const totals = Object.fromEntries(Object.keys(generalScores).map((type) => [type, generalScores[type] + adjectiveScores[type]]));
    assert.deepEqual(result.general_scores, generalScores);
    assert.deepEqual(result.adjective_scores, adjectiveScores);
    assert.deepEqual(result.totals, totals);
    const ranked = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
    assert.equal(result.top1, ranked[0]);
    assert.equal(result.top2, ranked[1]);
    for (const entry of result.job_recommendations) {
      const source = interpretations.types[entry.type];
      assert.deepEqual(entry.jobs, [...new Set([...source.seniorJobs, ...source.generalJobs])].slice(0, 5));
    }
    pass(`${width} saved 42+5 answers -> score, ranking, recommendations regression`);
    await textButton("A4 출력").click();
    await textButton("인쇄 / PDF 저장").waitFor();
    await shot("06-pdf-preview");
    await textButton("돌아가기").click();
    await page.reload();
    assert.deepEqual(await getResult(), result);
    assert.deepEqual(errors, []);
    pass(`${width} preview/return/reload keep stored result unchanged; no JS errors`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  if (courseId) {
    const { error } = await db.from("courses").delete().eq("id", courseId).eq("code", code);
    if (error) throw error;
    const { data, error: lookupError } = await db.from("courses").select("id").eq("id", courseId);
    if (lookupError) throw lookupError;
    assert.equal(data.length, 0);
    const { data: remainingSessions, error: sessionsError } = await db.from("sessions").select("id").eq("course_id", courseId);
    if (sessionsError) throw sessionsError;
    assert.equal(remainingSessions.length, 0);
    for (const table of ["responses", "results"]) {
      if (!sessionIds.length) continue;
      const { data: remaining, error: remainingError } = await db.from(table).select("session_id").in("session_id", sessionIds);
      if (remainingError) throw remainingError;
      assert.equal(remaining.length, 0);
    }
    evidence.cleanup = true;
    pass("test course and sessions removed (responses/results cascade)");
  }
  writeFileSync(resolve(output, "checks.json"), JSON.stringify(evidence, null, 2));
}

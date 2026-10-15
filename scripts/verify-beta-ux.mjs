// Real Chromium + existing APIs/DB, including customer output restrictions.
// Only random, non-default test courses are created/deleted.
// node --env-file=.env.local scripts/verify-beta-ux.mjs
// Requires playwright (or PLAYWRIGHT_MODULE pointing to an existing playwright installation).
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.VERIFY_BASE_URL || "http://localhost:3002";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const code = randomBytes(18).toString("base64url");
const entry = `/c/${code}`;
const nickname = `Beta${Date.now().toString().slice(-5)}`;
const phone = "1729";
const output = "scratch/beta-ux";
const passed = [];
let browser;
let activePage;
let courseId;
const check = (name) => { passed.push(name); console.log(`PASS ${name}`); };
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

try {
  courseId = must(await db.from("courses").insert({ code, name: "beta-ux-disposable" }).select("id").single()).id;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(25000);
  const clientErrors = [];
  page.on("pageerror", (error) => clientErrors.push(error.message));
  await mkdir(output, { recursive: true });

  async function layout(name) {
    // Streaming route refresh can briefly replace the previously visible screen with its fallback.
    await page.waitForLoadState("networkidle");
    if (name.startsWith("general-")) await page.getByRole("progressbar").waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  }
  async function number(n) {
    await page.waitForFunction((target) => document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") === String(target), n);
  }
  async function enter(who = nickname, digits = phone) {
    await page.goto(`${base}${entry}`);
    await page.getByLabel("닉네임", { exact: true }).fill(who);
    await page.getByLabel("휴대폰 뒷자리 4자리").fill(digits);
    await page.getByLabel("개인정보 수집에 동의합니다").check();
    await page.getByRole("button", { name: "시작하기", exact: true }).click();
    await page.waitForURL(`**${entry}/test`);
  }
  const session = async () => must(await db.from("sessions").select("*").eq("course_id", courseId).eq("nickname", nickname).single());
  const responses = async (id) => must(await db.from("responses").select("item_id, value").eq("session_id", id).order("item_id"));
  const post = (path, data) => context.request.post(`${base}${path}`, { headers: { Origin: base }, data });
  const token = async () => (await context.cookies()).find((cookie) => cookie.name === "jd_session")?.value;
  async function revoked(oldToken) {
    const response = await fetch(`${base}/api/session`, { headers: { Cookie: `jd_session=${oldToken}` } });
    assert.equal(response.status, 401);
    const denied = await fetch(`${base}/api/session/responses?courseCode=${code}`, { headers: { Cookie: `jd_session=${oldToken}` } });
    assert.equal(denied.status, 401);
  }
  async function end() {
    await page.getByRole("button", { name: "이용 종료", exact: true }).click();
    await page.getByRole("button", { name: "저장하고 이용 종료", exact: true }).click();
    await page.waitForURL(base + "/");
  }

  for (const [width, height] of [[360, 800], [390, 844], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.goto(base);
    await page.locator('[data-start-cta="hero"], [data-start-notice]').first().waitFor({ state: "visible" });
    const cta = page.locator('[data-start-cta="hero"]');
    if (await cta.count()) {
      await cta.waitFor({ state: "visible" });
      const rect = await cta.boundingBox();
      assert.ok(rect && rect.y >= 0 && rect.y + rect.height <= height);
    } else {
      await page.locator("[data-start-notice]").first().waitFor();
    }
    await layout(`home-${width}`);
    await page.goto(`${base}${entry}`);
    await page.getByRole("button", { name: "← 이전", exact: true }).waitFor();
    await page.getByRole("button", { name: "홈", exact: true }).waitFor();
    await layout(`entry-${width}`);
  }
  check("360/390/1440 home + entry layouts; first-screen start action");
  await page.setViewportSize({ width: 390, height: 844 });
  await enter();
  await number(1);
  await page.getByRole("button", { name: "예", exact: true }).click();
  await number(2);
  // Cancel the automatic timer while it is waiting. The earlier response must remain.
  await page.getByRole("button", { name: "아니요", exact: true }).click();
  await page.getByRole("button", { name: "← 이전", exact: true }).click();
  await number(1);
  await page.waitForTimeout(450);
  await number(1);
  assert.equal(await page.getByRole("button", { name: "예", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "아니요", exact: true }).click();
  await number(2);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await number(3);
  check("previous cancels auto-advance; previous answer displayed and editable");

  await page.route("**/api/session/response", (route) => route.fulfill({ status: 503, json: { error: { message: "test outage" } } }));
  await page.getByRole("button", { name: "예", exact: true }).click();
  await number(4);
  await page.getByRole("button", { name: "홈", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "응답을 저장하지 못했어요" }).waitFor();
  assert.ok(page.url().endsWith("/test"));
  let logoutRequests = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/session/logout")) logoutRequests++; });
  await page.getByRole("button", { name: "이용 종료", exact: true }).click();
  await page.getByRole("button", { name: "저장하고 이용 종료", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "응답을 저장하지 못했어요" }).waitFor();
  assert.equal(logoutRequests, 0);
  await page.getByRole("button", { name: "계속 이용하기" }).click();
  await page.unroute("**/api/session/response");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const oldToken = await token();
  await end();
  await revoked(oldToken);
  const firstSession = await session();
  const saved = await responses(firstSession.id);
  assert.equal(saved.length, 3);
  assert.equal(saved.find((row) => row.item_id === "g01").value, false);
  check("save failure blocks home/logout; retry saves responses before token revocation");

  await enter();
  await number(4);
  assert.equal((await session()).id, firstSession.id);
  assert.notEqual(await token(), oldToken);
  await page.getByRole("button", { name: "홈", exact: true }).click();
  await page.waitForURL(base + "/");
  assert.ok(await token());
  await page.goto(`${base}${entry}/test`);
  await number(4);
  await page.reload();
  await number(4);
  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await layout(`general-${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  check("in-progress re-entry reuses data; home preserves authentication; refresh resumes");

  for (let n = 4; n <= 42; n++) {
    await number(n);
    await page.getByRole("button", { name: "예", exact: true }).click();
  }
  await page.getByText("나를 잘 나타내는 말을 5개 이상 골라 주세요.", { exact: true }).waitFor();
  const chips = page.locator('button[aria-pressed]');
  assert.equal(await chips.count(), 30);
  assert.equal(await page.getByRole("button", { name: "다음", exact: true }).isEnabled(), false);
  for (let i = 0; i < 5; i++) await chips.nth(i).click();
  await page.getByRole("button", { name: "← 이전", exact: true }).click();
  await number(42);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  assert.equal(await page.locator('button[aria-pressed="true"]').count(), 5);
  for (const width of [360, 390, 1440]) { await page.setViewportSize({ width, height: 900 }); await layout(`adjectives-${width}`); }
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("heading", { name: "최종 제출", exact: true }).waitFor();
  await page.getByRole("button", { name: "형용사 선택 확인·수정" }).click();
  assert.equal(await page.locator('button[aria-pressed="true"]').count(), 5);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByText("일반성향 응답 확인·수정", { exact: true }).click();
  await page.getByRole("button", { name: /^1\. / }).click();
  await page.getByRole("button", { name: "예", exact: true }).click();
  await page.getByRole("button", { name: "확인 화면으로", exact: true }).click();
  await page.getByRole("heading", { name: "최종 제출" }).waitFor();
  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await layout(`review-${width}`);
  }
  check("42 questions -> adjectives -> review; 30 adjectives/minimum 5; optional edits retained");

  // A queued failed response must prevent submission too.
  await page.getByText("일반성향 응답 확인·수정", { exact: true }).click();
  await page.getByRole("button", { name: /^1\. / }).click();
  await page.route("**/api/session/response", (route) => route.fulfill({ status: 503 }));
  await page.getByRole("button", { name: "아니요", exact: true }).click();
  await page.getByRole("button", { name: "확인 화면으로", exact: true }).click();
  let submits = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/session/submit")) submits++; });
  await page.getByRole("button", { name: "검사 제출하기", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "저장되지 않은 응답" }).waitFor();
  assert.equal(submits, 0);
  await page.unroute("**/api/session/response");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.route("**/api/session/submit", (route) => route.fulfill({ status: 503 }));
  await page.getByRole("button", { name: "검사 제출하기", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "다시 제출" }).waitFor();
  await page.unroute("**/api/session/submit");
  const submitsBefore = submits;
  const submitButton = page.getByRole("button", { name: "검사 제출하기", exact: true });
  await submitButton.evaluate((button) => { button.click(); button.click(); });
  await page.waitForURL(`**${entry}/result`);
  assert.equal(submits - submitsBefore, 1);
  await page.getByRole("heading", { name: `${nickname}님의 검사 결과` }).waitFor();
  check("pending queue blocks submit; failure retries; duplicate touch sends one request; automatic result redirect");

  const resultBefore = must(await db.from("results").select("*").eq("session_id", firstSession.id).single());
  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await layout(`result-${width}`);
    assert.equal(await page.getByRole("button", { name: "홈으로", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "← 이전", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: /PDF|인쇄|A4|미리보기/ }).count(), 0);
    assert.equal(await page.locator('[data-print-sheet], [data-preview], a[download]').count(), 0);
    assert.doesNotMatch(await page.locator("body").innerText(), /PDF|인쇄|A4/);
  }
  await page.getByRole("link", { name: "홈으로", exact: true }).click();
  await page.waitForURL(base + "/");
  await page.goBack();
  await page.getByRole("heading", { name: `${nickname}님의 검사 결과` }).waitFor();
  assert.deepEqual(must(await db.from("results").select("*").eq("session_id", firstSession.id).single()), resultBefore);
  check("full web result only; no PDF/print/hidden A4; home + browser back preserve result");

  // Browser-native printing is outside the service restriction; do not blank the web result.
  await page.emulateMedia({ media: "print" });
  assert.ok(await page.getByRole("heading", { name: nickname + "님의 검사 결과" }).isVisible());
  assert.equal(await page.locator('[data-print-sheet]').count(), 0);
  await page.emulateMedia({ media: "screen" });

  for (const path of [entry + "/result/print", entry + "/result/pdf", entry + "/result/preview", "/api/session/pdf", "/api/session/print"]) {
    const response = await context.request.get(base + path);
    assert.equal(response.status(), 404, path);
  }
  for (const query of ["?print=1", "?mode=print", "?preview=true", "?download=pdf"]) {
    await page.goto(base + entry + "/result" + query);
    await page.getByRole("heading", { name: nickname + "님의 검사 결과" }).waitFor();
    assert.equal(await page.locator('[data-print-sheet], [data-preview], a[download]').count(), 0);
    assert.equal(await page.getByRole("button", { name: /PDF|인쇄|A4|미리보기/ }).count(), 0);
  }
  await page.goto(base + entry + "/result");
  await page.getByRole("heading", { name: nickname + "님의 검사 결과" }).waitFor();
  for (const path of ["/admin/results","/admin/results/" + firstSession.id, "/admin/results/" + firstSession.id + "?print=1"]) {
    const response = await context.request.get(base + path, { maxRedirects: 0 });
    assert.equal(response.status(), 307);
    assert.equal(new URL(response.headers().location, base).pathname, "/admin/login");
    assert.ok(!(await response.text()).includes("data-print-sheet"));
  }
  check("customer output URLs/APIs return 404; query flags cannot enable output; customer cookie cannot use admin output");

  const submittedToken = await token();
  await page.route("**/api/session/logout", (route) => route.abort());
  await page.getByRole("button", { name: "이용 종료", exact: true }).click();
  await page.getByText("이용을 종료하면 진단 결과를 다시 확인할 수 없습니다. 결과를 충분히 확인한 뒤 종료해 주세요.", { exact: true }).waitFor();
  assert.doesNotMatch(await page.locator("body").innerText(), /PDF|인쇄|A4/);
  await page.getByRole("button", { name: "저장하고 이용 종료" }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await token(), submittedToken);
  assert.ok(page.url().endsWith("/result"));
  await page.unroute("**/api/session/logout");
  await page.getByRole("button", { name: "저장하고 이용 종료" }).click();
  await page.waitForURL(base + "/");
  await revoked(submittedToken);
  await page.goBack();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.getByRole("heading", { name: `${nickname}님의 검사 결과` }).count(), 0);
  await page.reload();
  assert.equal(await page.getByRole("heading", { name: `${nickname}님의 검사 결과` }).count(), 0);
  await page.goto(`${base}${entry}/result`);
  await page.getByLabel("닉네임", { exact: true }).waitFor();
  const reenter = await post("/api/session/enter", { courseCode: code, nickname, phoneLast4: phone, consent: true });
  assert.equal(reenter.status(), 409);
  assert.equal((await reenter.json()).error.code, "ALREADY_SUBMITTED");
  assert.deepEqual(must(await db.from("results").select("*").eq("session_id", firstSession.id).single()), resultBefore);
  check("logout network failure retains session; success revokes protected access/back/refresh; submitted re-entry denied; result preserved");

  await enter("OtherBeta", "2718");
  await number(1);
  assert.equal(await page.locator('button[aria-pressed="true"]').count(), 0);
  assert.equal(await page.getByRole("button", { name: "다음", exact: true }).count(), 0);
  await end();
  check("another customer on the same device starts with no previous responses");

  // Restore both legacy DB values and a legacy local queued step without changing schema.
  const legacyUser = "LegacyBeta";
  const entered = await post("/api/session/enter", { courseCode: code, nickname: legacyUser, phoneLast4: phone, consent: true });
  assert.equal(entered.status(), 200);
  const legacy = must(await db.from("sessions").select("id").eq("course_id", courseId).eq("nickname", legacyUser).single());
  const legacyRows = Array.from({ length: 42 }, (_, i) => ({ session_id: legacy.id, item_id: `g${String(i + 1).padStart(2, "0")}`, value: true }));
  must(await db.from("responses").insert(legacyRows));
  for (const step of ["part1-done", "adjectives-intro"]) {
    must(await db.from("sessions").update({ current_step: step }).eq("id", legacy.id));
    await page.goto(`${base}${entry}/test`);
    await page.getByText("나를 잘 나타내는 말을 5개 이상 골라 주세요.", { exact: true }).waitFor();
    const response = await post("/api/session/step", { courseCode: code, step });
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).currentStep, "adjectives");
  }
  await page.evaluate(({ code, id }) => {
    localStorage.setItem(`jd_pending_owner:${code}`, id);
    localStorage.setItem(`jd_pending:${code}`, JSON.stringify([{ itemId: "a01", value: true }, { itemId: "__step__", value: "part1-done" }]));
  }, { code, id: legacy.id });
  await page.reload();
  await page.locator('button[aria-pressed="true"]').waitFor();
  assert.equal(await page.locator('button[aria-pressed="true"]').count(), 1);
  check("legacy DB steps + legacy queued step recover into adjectives with responses intact");
  assert.deepEqual(clientErrors, []);
  check("no browser JavaScript errors");
} catch (error) {
  await activePage?.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (courseId) {
    const { error } = await db.from("courses").delete().eq("id", courseId).eq("code", code);
    if (error) throw new Error(`Test fixture cleanup failed: ${error.message}`);
    assert.equal(must(await db.from("courses").select("id").eq("code", code)).length, 0);
    check("only disposable fixture removed; production data untouched");
  }
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/verification.json`, JSON.stringify({ passed, count: passed.length }, null, 2));
  console.log(`Browser checks passed: ${passed.length}`);
}

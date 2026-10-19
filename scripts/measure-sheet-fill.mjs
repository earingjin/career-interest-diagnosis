// 관리자 A4 결과지의 빈 공간을 1·2순위 30가지 조합 모두에서 쪽별로 측정한다 (실제 서버, 실제 Chrome).
//
// 준비: npm run build 를 먼저 실행해 두어야 한다 (빌드한 앱을 3112 포트로 직접 띄운다).
// 실행: node scripts/measure-sheet-fill.mjs [라벨]      예) node scripts/measure-sheet-fill.mjs before
//
// DB 는 건드리지 않는다. Supabase 주소는 빌드 때 코드에 들어가므로, 서버 프로세스의 fetch 를 미리 감싸
// Supabase REST 요청(/rest/v1/, /auth/v1/)을 이 스크립트가 띄운 가짜 서버로 보낸다.
// 가짜 서버는 관리자 결과 상세가 읽는 sessions 조회 한 가지에만 테스트 결과를 돌려준다.
// 결과는 scratch/sheet-fill/<라벨>.json, <라벨>.md 에 남기고 표로 출력한다.
//
// 측정 항목 (쪽별, mm)
//   bottomGap  마지막 콘텐츠(글자·그래프·배경이나 테두리가 있는 상자) 하단 ~ 바닥글 상단
//   blockGap   쪽 안에서 위아래로 이웃한 블록(글자·그래프·배경/테두리 상자) 사이의 가장 큰 빈 띠
//   inkGap     참고용: 글자·그래프만 기준으로 한 가장 큰 빈 띠 (상자 안의 빈 곳까지 포함)
//   edge       글자·상자가 종이 가장자리에 가장 가까운 거리
//   minFontPt  가장 작은 글자 크기 (그래프 글자는 실제 축소 비율을 반영)
//   problems   넘침·잘림·장 수 이상

import http from "node:http";
import { createHash, createHmac, randomBytes, scryptSync } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const LABEL = process.argv[2] ?? "current";
const PORT = Number(process.env.SHEET_PORT ?? 3112);
const FAKE_DB_PORT = PORT + 50000;
const DEBUG_PORT = PORT + 6200;
const BASE = `http://127.0.0.1:${PORT}`;
const TYPES = ["R", "I", "A", "S", "E", "C"];
const NICKNAME = "가나다라마바사아자차"; // 닉네임 최대 길이(10자)
const OUTPUT = "scratch/sheet-fill";
const SCREENSHOT_PAIRS = (process.env.SHEET_SCREENSHOTS ?? "SE,CI,RA").split(",").filter(Boolean);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pairs = [];
for (const t1 of TYPES) for (const t2 of TYPES) if (t1 !== t2) pairs.push(`${t1}${t2}`);
const idOf = (pair) => `00000000-0000-4000-8000-${String(pairs.indexOf(pair) + 1).padStart(12, "0")}`;

const jobGolden = JSON.parse(readFileSync(new URL("../src/lib/scoring/__tests__/__fixtures__/jobs-30.json", import.meta.url), "utf8"));
const catalog = JSON.parse(readFileSync(new URL("../src/content/job-catalog.json", import.meta.url), "utf8"));
/** 1·2순위 조합의 추천직업. 앱의 selectJobs 결과를 담은 골든 파일(jobCatalog.test.ts 가 앱 로직과 일치함을 검증)을 그대로 쓴다. */
function jobsFor(top1, top2) {
  if (process.env.SHEET_ALL_JOBS === "1") return [top1, top2].map((type) => {
    const jobs = catalog.sources.filter((entry) => entry.type === type).map((entry) => entry.rawName);
    return { type, jobs, count: jobs.length, hasMore: false };
  });
  const recs = jobGolden[top1 + top2];
  if (!recs) throw new Error("골든 파일에 없는 조합: " + top1 + top2);
  return structuredClone(recs);
}

function sessionRow(pair) {
  const [top1, top2] = pair;
  const zero = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  // 다른 유형에도 점수를 넣어 막대가 모두 보이게 한다 (1·2순위는 그대로 유지).
  const general = { ...zero };
  const adjective = { ...zero };
  TYPES.forEach((type, index) => { general[type] = 1 + (index % 3); adjective[type] = index % 2; });
  general[top1] = 9; adjective[top1] = 2;
  general[top2] = 8; adjective[top2] = 1;
  const totals = Object.fromEntries(TYPES.map((type) => [type, general[type] + adjective[type]]));
  return {
    id: idOf(pair), nickname: NICKNAME, status: "submitted", submitted_at: "2026-10-15T03:00:00.000+00:00",
    courses: { name: "측정용 과정" },
    results: { scoring_version: "measure", general_scores: general, adjective_scores: adjective, totals, top1, top2, job_recommendations: jobsFor(top1, top2) },
  };
}

// 관리자 결과 상세가 보내는 GET /rest/v1/sessions?...&id=eq.<uuid> 에만 답한다.
const fakeHits = [];
const fakeDb = http.createServer((req, res) => {
  const url = new URL(req.url, "http://fake");
  fakeHits.push(`${req.method} ${url.pathname}`);
  const id = url.searchParams.get("id")?.replace(/^eq\./, "");
  const tokenHash = url.searchParams.get("token_hash")?.replace(/^eq\./, "");
  const pair = pairs.find((p) => idOf(p) === id || createHash("sha256").update(`measure-${p}`).digest("hex") === tokenHash);
  const data = pair && tokenHash
    ? { id: idOf(pair), status: "submitted", current_step: "result", courses: { code: pair, name: "측정용 과정" } }
    : pair ? sessionRow(pair) : null;
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(req.method === "GET" && url.pathname === "/rest/v1/sessions" && data ? [data] : []));
});

function findChrome() {
  return [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find((p) => existsSync(p)) ?? null;
}

async function cdpSession(chromePath, profileDir) {
  const chrome = spawn(chromePath, [
    "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profileDir}`,
    "--disable-gpu", "--no-sandbox", "--disable-extensions", "--no-first-run", "--window-size=1280,1400", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
  let chromeErrors = "";
  chrome.stderr.on("data", (chunk) => { chromeErrors += chunk.toString(); });
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === "page"); } catch { /* 시작 중 */ }
    if (!target) await delay(250);
  }
  if (!target) { chrome.kill(); throw new Error("Chrome 원격 디버깅에 연결하지 못했습니다. " + chromeErrors.slice(-1200)); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve); ws.addEventListener("error", reject); });
  let id = 0;
  const waiting = new Map();
  ws.addEventListener("message", (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    const timeout = setTimeout(() => { waiting.delete(i); reject(new Error(`${method}: timeout. ${chromeErrors.slice(-1000)}`)); }, 20000);
    waiting.set(i, (d) => { clearTimeout(timeout); return d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`스크립트 오류: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  return { send, evaluate, close: () => { try { ws.close(); } catch { /* 이미 닫힘 */ } chrome.kill(); } };
}

// Chrome 안에서 실행한다. 쪽별 측정값을 JSON 으로 돌려준다.
const MEASURE = `(() => {
  const PX_PER_MM = 96 / 25.4;
  const mm = (px) => Math.round((px / PX_PER_MM) * 10) / 10;
  const root = document.querySelector('[data-print-sheet]');
  if (!root) return { error: '결과지를 찾지 못함' };
  const pages = [...root.querySelectorAll('[data-print-page]')];
  const visible = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const paints = (el) => {
    const s = getComputedStyle(el);
    const bg = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
    const border = ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(s['border' + side + 'Width']) > 0 && s['border' + side + 'Style'] !== 'none');
    return bg || border;
  };
  const result = pages.map((page, index) => {
    const p = page.getBoundingClientRect();
    const footer = page.querySelector('footer');
    const footerTop = footer ? footer.getBoundingClientRect().top : p.bottom;
    const problems = [];
    const ink = [];   // 글자·그래프 (label 은 문제 보고용)
    const boxes = []; // 배경·테두리가 있는 상자
    let minFont = Infinity;
    let edge = Infinity;
    const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const el = node.parentElement;
      if (!visible(el)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) ink.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, inFooter: footer && footer.contains(el), label: node.textContent.trim().slice(0, 12) });
      let size = parseFloat(getComputedStyle(el).fontSize);
      if (el instanceof SVGElement) {
        const svg = el.ownerSVGElement;
        const vb = svg.viewBox.baseVal;
        size = size * (svg.getBoundingClientRect().width / vb.width);
      }
      minFont = Math.min(minFont, size);
    }
    for (const svg of page.querySelectorAll('svg')) {
      for (const shape of svg.querySelectorAll('polygon, line, circle')) {
        const r = shape.getBoundingClientRect();
        ink.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
      }
    }
    for (const el of page.querySelectorAll('*')) {
      if (el === page || el instanceof SVGElement || !visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (paints(el) && !(footer && (footer === el || footer.contains(el)))) boxes.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, label: el.tagName + '.' + String(el.className).slice(0, 24) });
      const s = getComputedStyle(el);
      if (s.overflow !== 'visible' && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
        problems.push('잘림: ' + el.tagName + ' ' + (el.textContent || '').trim().slice(0, 16));
      }
      // overflow:visible 이어도 내용이 상자보다 크면 아래 영역과 겹친다.
      if (s.overflow === 'visible' && s.display !== 'inline' && el.scrollHeight > el.clientHeight + 2) {
        problems.push('영역 밖으로 넘침(' + mm(el.scrollHeight - el.clientHeight) + 'mm): ' + el.tagName + ' ' + (el.textContent || '').trim().slice(0, 16));
      }
      if (r.bottom > p.bottom + 0.75) problems.push('아래로 넘침: ' + el.tagName + ' ' + (el.textContent || '').trim().slice(0, 16));
      if (r.right > p.right + 0.75 || r.left < p.left - 0.75) problems.push('옆으로 넘침: ' + el.tagName);
    }
    if (page.scrollHeight > page.clientHeight + 1) problems.push('내용이 결과지보다 김');
    for (const r of [...ink, ...boxes]) {
      edge = Math.min(edge, r.top - p.top, p.bottom - r.bottom, r.left - p.left, p.right - r.right);
      if (r.bottom > footerTop + 0.75 && !r.inFooter && r.top < footerTop) problems.push('바닥글과 겹침(' + mm(r.bottom - footerTop) + 'mm): ' + (r.label || '그래프'));
    }
    // 세로 띠: 머리 영역 위쪽(첫 콘텐츠)부터 바닥글 위까지 빈 띠를 찾는다.
    const largestGap = (rects) => {
      const list = rects.filter((r) => !r.inFooter && r.bottom <= footerTop + 0.75).map((r) => [r.top, Math.min(r.bottom, footerTop)]).sort((a, b) => a[0] - b[0]);
      let gap = 0; let end = -Infinity; let where = '';
      for (const [top, bottom] of list) {
        if (end > -Infinity && top - end > gap) { gap = top - end; where = mm(end - p.top) + 'mm'; }
        end = Math.max(end, bottom);
      }
      return { gap: mm(gap), where, lastBottom: end };
    };
    const block = largestGap([...ink, ...boxes]);
    const inkOnly = largestGap(ink);
    return {
      page: index + 1,
      bottomGap: mm(footerTop - block.lastBottom),
      footerSlack: footer ? mm(p.bottom - parseFloat(getComputedStyle(page).paddingBottom) - footer.getBoundingClientRect().bottom) : 0,
      blockGap: block.gap, blockGapAt: block.where,
      inkGap: inkOnly.gap, inkGapAt: inkOnly.where,
      edge: mm(edge),
      minFontPt: Math.round(minFont * 0.75 * 10) / 10,
      size: mm(p.width) + 'x' + mm(p.height),
      problems: [...new Set(problems)].slice(0, 5),
    };
  });
  return { pageCount: pages.length, pages: result };
})()`;

const chromePath = findChrome();
if (!chromePath) throw new Error("Chrome/Edge 를 찾지 못했습니다 (CHROME_PATH 로 경로를 지정하세요).");

const secret = randomBytes(48).toString("base64url");
const salt = randomBytes(16);
const passwordHash = `scrypt:4096:8:1:${salt.toString("base64url")}:${scryptSync(randomBytes(24), salt, 32, { N: 4096, r: 8, p: 1, maxmem: 16 * 1024 * 1024 }).toString("base64url")}`;
const iat = Math.floor(Date.now() / 1000);
const pv = createHash("sha256").update(passwordHash).digest("hex").slice(0, 32);
const encoded = Buffer.from(JSON.stringify({ v: 1, iat, exp: iat + 28800, pv })).toString("base64url");
const adminToken = `${encoded}.${createHmac("sha256", secret).update(`jd-admin-session.${encoded}`).digest("base64url")}`;

mkdirSync(OUTPUT, { recursive: true });
await new Promise((resolve) => fakeDb.listen(FAKE_DB_PORT, "127.0.0.1", resolve));
console.log("Measurement fixture ready");
// 서버 프로세스에서 Next 보다 먼저 실행되어 Supabase 요청만 가짜 서버로 돌린다.
const FETCH_REDIRECT = `
const target = process.env.MEASURE_FAKE_DB;
const original = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.pathname.startsWith("/rest/v1/") || url.pathname.startsWith("/auth/v1/")) return original(target + url.pathname + url.search, init);
  return original(input, init);
};`;
const server = spawn(process.execPath, [
  "--import", `data:text/javascript,${encodeURIComponent(FETCH_REDIRECT)}`,
  "node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1",
], {
  windowsHide: true, stdio: "ignore",
  env: {
    ...process.env,
    MEASURE_FAKE_DB: `http://127.0.0.1:${FAKE_DB_PORT}`,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${FAKE_DB_PORT}`, SUPABASE_SERVICE_ROLE_KEY: "fake", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fake",
    ADMIN_ID: "measure-operator", ADMIN_PASSWORD_HASH: passwordHash, ADMIN_SESSION_SECRET: secret,
  },
});
let session;
const rows = [];
try {
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    if (server.exitCode !== null) throw new Error("측정 서버가 시작되지 않았습니다 (npm run build, 3112 포트 확인).");
    try { ready = (await fetch(`${BASE}/api/health`)).ok; } catch { /* 시작 중 */ }
    if (!ready) await delay(250);
  }
  if (!ready) throw new Error("측정 서버 준비 시간 초과");
  console.log("Measurement app ready");

  session = await cdpSession(chromePath, `${process.cwd()}/scratch/chrome-profile-${LABEL}`);
  console.log("Measurement Chrome ready");
  const { send, evaluate } = session;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCookie", { name: "jd_admin", value: adminToken, url: BASE, httpOnly: true });

  // 첫 로드는 서버·폰트 준비 때문에 값이 흔들리므로 한 번 열어 두고 측정을 시작한다.
  for (const pair of process.env.SHEET_MOBILE_ONLY === "1" ? [] : [pairs[0], ...pairs]) {
    const warmUp = rows.length === 0 && !rows.warmed;
    await send("Page.navigate", { url: `${BASE}/admin/results/${idOf(pair)}` });
    let found = false;
    for (let i = 0; i < 80 && !found; i++) {
      await delay(150);
      found = await evaluate(`location.pathname.endsWith('${idOf(pair)}') && document.readyState === 'complete' && !!document.querySelector('[data-print-sheet]')`).catch(() => false);
    }
    if (!found) {
      const where = await evaluate("location.pathname + ' | ' + document.body.innerText.slice(0, 80)").catch(() => "?");
      throw new Error(`${pair}: 결과지를 불러오지 못함 (${where}, DB 요청 ${fakeHits.length}회)`);
    }
    await evaluate("document.fonts.ready.then(() => true)");
    await send("Emulation.setEmulatedMedia", { media: "print" });
    await delay(200);
    const m = await evaluate(MEASURE);
    // 영역을 늘리지 않았을 때의 여유 높이(=늘려서 흡수한 높이). 바닥글이 올라가므로 바닥글 아래 남는 높이로 잰다.
    await evaluate("(() => { const s = document.createElement('style'); s.id = 'natural'; s.textContent = '[data-print-page] * { flex-grow: 0 !important; }'; document.head.append(s); return true; })()");
    const natural = await evaluate(MEASURE);
    await evaluate("document.getElementById('natural').remove(); true");
    m.pages.forEach((page, i) => { page.naturalSlack = natural.pages[i].footerSlack; });
    if (m.error) throw new Error(`${pair}: ${m.error}`);
    const { data } = await send("Page.printToPDF", { preferCSSPageSize: true, printBackground: true });
    const pdfPages = (Buffer.from(data, "base64").toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    if (warmUp) { rows.warmed = true; await send("Emulation.setEmulatedMedia", { media: "screen" }); continue; }
    const jobMetrics = await evaluate(`(() => {
      const page = document.querySelector('[data-print-page="2"]');
      return [...page.querySelectorAll('ol[aria-label="추천직업"]')].map((list) => ({
        names: [...list.children].map((item) => item.textContent),
        fontPt: parseFloat(getComputedStyle(list.firstElementChild).fontSize) * 72 / 96,
        heightMm: list.getBoundingClientRect().height * 25.4 / 96,
        overflow: list.scrollWidth > list.clientWidth + 1,
      }));
    })()`);
    rows.push({ pair, pdfPages, jobs: jobMetrics, ...m });
    writeFileSync(`${OUTPUT}/${LABEL}-${pair}.pdf`, Buffer.from(data, "base64"));
    console.log(`${LABEL} ${pair}: ${pdfPages} pages, ${jobMetrics.map((job) => job.names.length).join("+")} jobs`);
    if (SCREENSHOT_PAIRS.includes(pair)) {
      // 흑백 인쇄 확인용: 회색조로 바꾼 화면을 저장한다.
      await evaluate("document.documentElement.style.filter = 'grayscale(1)'; true");
      const shot = await send("Page.captureScreenshot", { captureBeyondViewport: true, clip: await evaluate(`(() => { const r = document.querySelector('[data-print-sheet]').getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height, scale: 1.5 }; })()`) });
      writeFileSync(`${OUTPUT}/${LABEL}-${pair}-gray.png`, Buffer.from(shot.data, "base64"));
      await evaluate("document.documentElement.style.filter = ''; true");
      writeFileSync(`${OUTPUT}/${LABEL}-${pair}.pdf`, Buffer.from(data, "base64"));
    }
    await send("Emulation.setEmulatedMedia", { media: "screen" });
  }
  if (process.env.SHEET_MOBILE === "1" || process.env.SHEET_MOBILE_ONLY === "1") {
    const mobile = [];
    await send("Emulation.setEmulatedMedia", { media: "screen" });
    for (const pair of ["SE", "RI", "AC"]) for (const width of [360, 390]) {
      await send("Network.setCookie", { name: "jd_session", value: `measure-${pair}`, url: BASE, httpOnly: true });
      await send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: true });
      await send("Page.navigate", { url: `${BASE}/c/${pair}/result` });
      let ready = false;
      for (let attempt = 0; attempt < 80 && !ready; attempt++) {
        await delay(100);
        ready = await evaluate(`!!document.querySelector('ol[aria-label="추천직업"]')`).catch(() => false);
      }
      if (!ready) throw new Error(`Mobile ${pair} failed to load`);
      await evaluate("document.fonts.ready.then(() => true)");
      const metrics = await evaluate(`(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        jobs: [...document.querySelectorAll('ol[aria-label="추천직업"]')].map((list) => [...list.children].map((item) => item.textContent)),
        styles: [...document.querySelectorAll('ol[aria-label="추천직업"] li')].map((item) => { const s = getComputedStyle(item); return [s.fontSize, s.lineHeight, s.padding, s.border, s.borderRadius]; }),
        html: document.querySelector('[class*="mobile"]').outerHTML,
      }))()`);
      if (metrics.overflow) throw new Error(`Mobile ${pair}/${width}: horizontal overflow`);
      const expected = jobsFor(...pair).map((entry) => entry.jobs);
      if (JSON.stringify(metrics.jobs) !== JSON.stringify(expected)) throw new Error(`Mobile ${pair}: recommendation mismatch`);
      const response = await (await fetch(`${BASE}/c/${pair}/result`, { headers: { cookie: `jd_session=measure-${pair}` } })).text();
      for (const marker of ["rawName", "sourceId", "representatives", catalog.document.sha256]) if (response.includes(marker)) throw new Error(`Catalog metadata exposed: ${marker}`);
      const shot = await send("Page.captureScreenshot", { captureBeyondViewport: true });
      writeFileSync(`${OUTPUT}/${LABEL}-mobile-${pair}-${width}.png`, Buffer.from(shot.data, "base64"));
      mobile.push({ pair, width, ...metrics });
      console.log(`${LABEL} mobile ${pair}/${width}: no overflow, matching jobs`);
    }
    writeFileSync(`${OUTPUT}/${LABEL}-mobile.json`, JSON.stringify(mobile, null, 2));
  }
} finally {
  session?.close();
  if (server.exitCode === null) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill();
  }
  fakeDb.close();
}

const otherRequests = fakeHits.filter((hit) => hit !== "GET /rest/v1/sessions");
const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : "-");
const lines = [
  `# A4 결과지 빈 공간 측정 (${LABEL})`,
  "",
  "단위 mm, 글자 pt. 하단=마지막 콘텐츠~바닥글, 블록간격=이웃 블록 사이 최대 빈 띠, 글자간격=글자·그래프만 기준 최대 빈 띠(참고), 여유=영역을 늘리지 않았을 때 쪽 아래에 남는 높이(영역 높이로 흡수한 양).",
  "",
  "| 조합 | PDF쪽 | 1쪽 하단 | 1쪽 블록간격 | 1쪽 글자간격 | 1쪽 여유 | 2쪽 하단 | 2쪽 블록간격 | 2쪽 글자간격 | 2쪽 여유 | 가장자리 | 최소 글자 | 문제 |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => {
    const [a, b] = r.pages;
    const problems = r.pages.flatMap((p) => p.problems.map((x) => `${p.page}쪽 ${x}`));
    if (r.pageCount !== 2) problems.push(`결과지 ${r.pageCount}장`);
    if (r.pdfPages !== 3) problems.push(`PDF ${r.pdfPages}쪽`);
    return `| ${r.pair} | ${r.pdfPages} | ${fmt(a.bottomGap)} | ${fmt(a.blockGap)} | ${fmt(a.inkGap)} | ${fmt(a.naturalSlack)} | ${fmt(b.bottomGap)} | ${fmt(b.blockGap)} | ${fmt(b.inkGap)} | ${fmt(b.naturalSlack)} | ${fmt(Math.min(a.edge, b.edge))} | ${fmt(Math.min(a.minFontPt, b.minFontPt))} | ${problems.join("; ") || "없음"} |`;
  }),
];
const stat = (pick) => {
  const values = rows.map(pick);
  return `최소 ${fmt(Math.min(...values))} · 최대 ${fmt(Math.max(...values))}`;
};
lines.push(
  "",
  "| 항목 | 1쪽 | 2쪽 |",
  "|---|---|---|",
  `| 하단 빈 공간 | ${stat((r) => r.pages[0].bottomGap)} | ${stat((r) => r.pages[1].bottomGap)} |`,
  `| 블록 사이 최대 간격 | ${stat((r) => r.pages[0].blockGap)} | ${stat((r) => r.pages[1].blockGap)} |`,
  `| 글자·그래프 사이 최대 간격(참고) | ${stat((r) => r.pages[0].inkGap)} | ${stat((r) => r.pages[1].inkGap)} |`,
  `| 늘리기 전 여유 높이 | ${stat((r) => r.pages[0].naturalSlack)} | ${stat((r) => r.pages[1].naturalSlack)} |`,
  `| 최소 글자(pt) | ${stat((r) => r.pages[0].minFontPt)} | ${stat((r) => r.pages[1].minFontPt)} |`,
  "",
  `가짜 DB 요청: sessions 조회 ${fakeHits.length - otherRequests.length}회, 그 밖의 요청 ${otherRequests.length}회`,
);
writeFileSync(`${OUTPUT}/${LABEL}.json`, JSON.stringify(rows, null, 2));
writeFileSync(`${OUTPUT}/${LABEL}.md`, lines.join("\n") + "\n");
console.log(lines.join("\n"));

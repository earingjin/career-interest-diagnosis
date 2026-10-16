// 추천직업 카탈로그(src/content/job-catalog.json)를 원본 PDF 와 직접 대조한다.
//
// 실행: node scripts/verify-job-catalog.mjs
// 필요: docs/source/직업선호도_해설지_퇴직경찰개정판.pdf (저장소에 없는 로컬 원본, Git 제외), poppler 의 pdftotext
// PDF 나 pdftotext 가 없으면 "미검증"으로 표시하고 종료 코드 2 로 끝난다 (대조가 생략된 것을 성공으로 보지 않는다).
//
// 확인하는 것
//   1. PDF 해시가 카탈로그에 기록된 값과 같은지
//   2. 본문 "퇴직경찰 추천직업" 유형별 블록이 본문 원본(sources, origin=body)과 이름·순서까지 같은지
//   3. 부록 근거·부록 전용 원본·보류 항목이 모두 부록 텍스트에 있는지
//   4. ★ 가 원본 직업 단위로 정확히 붙어 있는지 (카탈로그의 star 값과 PDF 의 ★ 위치가 같은지)
//   5. PDF 가 Git 추적 대상이 아니고 .gitignore 로 제외되는지

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PDF = new URL("../docs/source/직업선호도_해설지_퇴직경찰개정판.pdf", import.meta.url);
const catalog = JSON.parse(readFileSync(new URL("../src/content/job-catalog.json", import.meta.url), "utf8"));
const strip = (s) => s.replace(/\s+/g, "");
const problems = [];
const fail = (message) => problems.push(message);

if (!existsSync(PDF)) {
  console.log("미검증: 원본 PDF(docs/source/…)가 없습니다.");
  process.exit(2);
}
let text;
try {
  text = execFileSync("pdftotext", ["-enc", "UTF-8", "-raw", fileURLToPath(PDF), "-"], { maxBuffer: 1 << 26 }).toString("utf8");
} catch {
  console.log("미검증: pdftotext 를 실행하지 못했습니다 (poppler 설치 필요).");
  process.exit(2);
}
const pages = text.split("\f").map(strip);
const body = pages.slice(0, 3).join("|");
const appendix = pages.slice(4, 8).join("|");

// 1. 해시
const sha = createHash("sha256").update(readFileSync(PDF)).digest("hex");
if (sha !== catalog.document?.sha256) fail(`PDF 해시 불일치: 카탈로그 ${catalog.document?.sha256}, 실제 ${sha}`);

// 2. 본문 블록
const blocks = [...body.matchAll(/퇴직경찰추천직업(.*?)등(?=\d\.|경찰전직|\||$)/g)].map((m) => m[1]);
const types = ["R", "I", "A", "S", "E", "C"];
if (blocks.length !== 6) fail(`본문 블록 수 ${blocks.length} (6 기대)`);
types.forEach((type, i) => {
  const mine = catalog.sources.filter((s) => s.origin === "body" && s.type === type).map((s) => s.rawName);
  if (strip(mine.join(",")) !== blocks[i]) fail(`${type} 본문 목록이 PDF 와 다름`);
});

// 3. 부록 근거·전용 원본·보류
const inAppendix = (name) => appendix.includes(strip(name));
for (const s of catalog.sources) {
  if (s.origin === "appendix" && !inAppendix(s.rawName)) fail(`${s.id} 부록에 없음: ${s.rawName}`);
  for (const r of s.appendixRefs) if (!inAppendix(r.text)) fail(`${s.id} 부록 근거 없음: ${r.text}`);
  if (s.status === "hold") {
    if (!body.includes(strip(s.rawName)) || !inAppendix(s.conflict.appendixText)) fail(`${s.id} 보류 항목이 본문·부록 양쪽에 없음`);
  }
}
for (const d of catalog.display) {
  const s = catalog.sources.find((x) => x.id === d.sourceId);
  if (d.relation === "same" && d.name !== s.rawName) fail(`${d.id} same 인데 원본과 다름`);
  if (d.evidence && !inAppendix(d.evidence.text) && !body.includes(strip(d.evidence.text))) fail(`${d.id} 근거 문구가 PDF 에 없음: ${d.evidence.text}`);
}

// 4. ★
const starTexts = new Set([
  ...catalog.sources.flatMap((s) => s.appendixRefs.filter((r) => r.star).map((r) => r.text)),
  ...catalog.sources.filter((s) => s.conflict?.appendixStar).map((s) => s.conflict.appendixText),
]);
const allRefTexts = new Set([
  ...catalog.sources.flatMap((s) => s.appendixRefs.map((r) => r.text)),
  ...catalog.sources.filter((s) => s.origin === "appendix").map((s) => s.rawName),
  ...catalog.sources.filter((s) => s.conflict).map((s) => s.conflict.appendixText),
]);
for (const t of allRefTexts) {
  const starred = appendix.includes("★" + strip(t));
  if (starred !== starTexts.has(t)) fail(`★ 불일치: ${t} (PDF ${starred ? "★ 있음" : "★ 없음"}, 카탈로그 ${starTexts.has(t) ? "★ 있음" : "★ 없음"})`);
}
const starCount = (appendix.match(/★/g) ?? []).length - 1; // 범례 문구의 ★ 1개 제외
if (starCount !== starTexts.size) fail(`★ 개수 불일치: PDF ${starCount}, 카탈로그 ${starTexts.size}`);

// 5. Git 제외
let tracked = "";
try {
  tracked = execFileSync("git", ["ls-files", "docs/source"], { encoding: "utf8" }).trim();
} catch { fail("git 을 실행하지 못했습니다."); }
if (tracked) fail("docs/source 의 파일이 Git 에 추적되고 있습니다: " + tracked);
if (!/^\/docs\/source\/\s*$/m.test(readFileSync(new URL("../.gitignore", import.meta.url), "utf8"))) fail(".gitignore 에 /docs/source/ 규칙이 없습니다.");

console.log(`원본 ${catalog.sources.length}건(본문 ${catalog.sources.filter((s) => s.origin === "body").length}, 부록 전용 ${catalog.sources.filter((s) => s.origin === "appendix").length}), 표시명 ${catalog.display.length}건, ★ ${starCount}건`);
if (problems.length) {
  console.log("실패 " + problems.length + "건");
  for (const p of problems) console.log(" - " + p);
  process.exit(1);
}
console.log("통과: PDF 해시·본문 목록·부록 근거·★·Git 제외가 모두 일치합니다.");

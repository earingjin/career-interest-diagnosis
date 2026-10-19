// 사용: node scripts/verify-job-catalog.mjs <추천직업최신.pdf의 로컬 경로>
// 원본 PDF는 저장소에 넣지 않는다. 직업명·순서의 독립 전사는 jobCatalog.test.ts에서 검증한다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const catalog = JSON.parse(readFileSync(new URL("../src/content/job-catalog.json", import.meta.url), "utf8"));
const path = process.argv[2];
if (!path) {
  console.error("사용: node scripts/verify-job-catalog.mjs <추천직업최신.pdf 경로>");
  process.exit(2);
}
const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
assert.equal(catalog.document.file, "추천직업최신.pdf");
assert.equal(catalog.document.sha256, sha256, "원본 PDF 해시가 카탈로그와 다릅니다.");

const types = ["R", "I", "A", "S", "E", "C"];
// 개정판 PDF 경로를 두 번째 인자로 주면 개정판 해시도 확인한다.
if (process.argv[3]) {
  assert.equal(catalog.revisedDocument.sha256, createHash("sha256").update(readFileSync(process.argv[3])).digest("hex"), "개정판 PDF 해시가 카탈로그와 다릅니다.");
}

for (const type of types) {
  const names = catalog.sources.filter((source) => source.type === type && !source.tier).map((source) => source.rawName);
  const priority = catalog.sources.filter((source) => source.type === type && source.tier === "priority").map((source) => source.rawName);
  const ranked = catalog.representatives[type].map(({ displayId }) => catalog.display.find((display) => display.id === displayId)?.name);
  assert.deepEqual(ranked, [...names, ...priority], `${type} 원본·신규 우선과 추천 순서가 다릅니다.`);
  const all = catalog.sources.filter((source) => source.type === type).map((source) => source.rawName.normalize("NFC").replace(/\s+/g, ""));
  assert.equal(new Set(all).size, all.length, `${type} 유형에 중복이 있습니다.`);
}
console.log(`통과: PDF SHA-256 ${sha256}, 유형별 최신+신규 우선/후순위 ${types.map((type) => `${type} ${catalog.representatives[type].length}/${catalog.supplements[type].length}`).join(", ")}`);

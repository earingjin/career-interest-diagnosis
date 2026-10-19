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
for (const type of types) {
  const names = catalog.sources.filter((source) => source.type === type).map((source) => source.rawName);
  const ranked = catalog.representatives[type].map(({ displayId }) => catalog.display.find((display) => display.id === displayId)?.name);
  assert.deepEqual(ranked, names, `${type} 원본과 추천 순서가 다릅니다.`);
  assert.equal(new Set(names.map((name) => name.normalize("NFC").replace(/\s+/g, ""))).size, names.length, `${type} 유형에 중복이 있습니다.`);
}
console.log(`통과: PDF SHA-256 ${sha256}, 유형별 직업 수 ${types.map((type) => `${type} ${catalog.representatives[type].length}`).join(", ")}`);

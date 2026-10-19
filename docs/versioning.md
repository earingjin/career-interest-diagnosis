# 결과 계산 및 추천직업 버전

`results.scoring_version`은 제출할 때 저장된다. 기존 완료 결과는 저장된 점수, 순위, 추천직업을 그대로 읽으며 새 카탈로그로 다시 계산하지 않는다.

| 버전 | 추천직업 선정 | 점수·순위·동점 처리 |
|---|---|---|
| 1.0.0 | `seniorJobs` 다음 `generalJobs`에서 선정 | 최초 규칙 |
| 1.1.0 | 퇴직경찰 카탈로그 대표 5개 우선, 부족분은 기존 목록에서 보충 | 1.0.0과 동일 |
| 1.2.0 | `추천직업최신.pdf`의 유형별 원문 목록에서만 순서대로 선정. 기존 목록 자동 보충 제거 | 1.0.0과 동일 |
| 1.3.0 | A4 3페이지 검증에 따른 유형별 상한. 같은 유형은 상대 순위와 무관한 목록 | 1.0.0과 동일 |
| 1.4.0 | 최신 72개 → 개정판 신규 우선 16개(대표 목록) → 신규 후순위 30개(예비 목록, 다양성 순서) 순으로 선정. 30개 조합 A4 검증으로 전부 표시 | 1.0.0과 동일 |

`JOB_CATALOG_VERSION`은 `src/content/version.ts`와 `src/content/job-catalog.json`에서 함께 관리한다. 현재 `1.0.0`은 본부장 제공 `추천직업최신.pdf` 1쪽의 6개 유형 목록이다. PDF SHA-256은 카탈로그의 `document.sha256`에 기록하며 `node scripts/verify-job-catalog.mjs <PDF 경로>`로 확인한다. 직업명과 순서의 독립 전사는 `src/lib/scoring/__tests__/jobCatalog.test.ts`가 검사한다. 카탈로그가 바뀌면 버전과 `job-catalog-lock.test.ts`의 해시를 함께 갱신한다.

추천 기본 상한 `JOBS_PER_TYPE`은 현재 5이며 `selectJobs`의 `limit` 인자로 변경할 수 있다. 이 값은 A4 최종 표시 개수 정책을 확정한 것이 아니다. 결과 화면은 저장된 1·2순위 추천 목록을 표시한다.

카탈로그 `1.1.0`은 `퇴직경찰_추천직업_통합후보_2차정밀검토.xlsx`(전체 검토표)의 `신규 우선` 16개를 `representatives` 끝에, `신규 후순위` 30개를 `supplements`에 추가했다. 추가 직업에는 `tier`, `document`, `page`, `jobGroup`이 있고 최신 72개 항목은 바뀌지 않았다. `중복 제외`·`검토 필요`(환경감시원 포함)는 넣지 않았다. 개정판 PDF 해시는 `revisedDocument.sha256`이며 `node scripts/verify-job-catalog.mjs <최신 PDF> <개정판 PDF>`로 확인한다. 기존 결과는 저장된 추천 목록을 그대로 표시한다.

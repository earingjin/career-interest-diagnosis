# 1차 베타테스트 UX 개선 결과

- 작업일: 2026-10-15 (한국 시간)
- 기준 커밋: `0d5628224ac94bb14535d87b759f5e3440df00fb` (`모바일화면 최적화`)
- 작업 시작 시 `git fetch origin` 후 로컬 `main`과 `origin/main` 일치, 작업 트리 변경 없음 확인.
- 작업 브랜치: `fix/beta-customer-ux`. 커밋·푸시·배포는 수행하지 않음.
- **구현 및 아래 자동 검증은 완료. 실제 스마트폰과 관리자 PC의 운영체제 인쇄 대화상자·실물 인쇄는 미검증이며, 이를 포함한 최종 현장 검수 완료로 처리하지 않음.**
- **정책 변경(2026-10-15)**: 고객 PDF·인쇄·A4 미리보기 기능은 제거되었고 관리자 A4 출력만 유지된다. 아래 본문 중 해당 변경으로 바뀐 부분은 갱신했으며, 배경과 검증은 **H절**에 기록한다.

## A. 요구사항별 구현 결과

| 요구사항 | 구현 상태 | 근거 |
| --- | --- | --- |
| FR-01 홈페이지 간소화 | 완료 | 기존 기본 과정 조회와 두 시작 버튼 재사용. 첫 화면은 진단명·짧은 소개·시작 버튼 중심으로 구성. 문항/결과 안내는 짧은 목록, 상세는 `details`로 접음. 360·390px 첫 화면 CTA 및 PC 확인. 비활성·없음·조회 실패 시 시작 차단은 기존 동작 유지. |
| FR-02 진단 내비게이션 통일 | 완료 | 정보 입력·일반성향·형용사·최종 제출에 공통 `이전`/`홈` 제공. 일반성향 응답과 형용사 선택 유지. 이전/홈/종료 시 자동 이동 타이머 취소. 홈/종료 전 저장 큐 배출, 저장 실패 시 이동 차단. 제출·종료 처리 중 응답 버튼 잠금. 오프라인 새로고침 복구 및 연속 응답/이전 확인. |
| FR-03 중간 확인 최소화 | 완료 | 42번 → 형용사 → 최종 제출 → 결과 자동 이동. 별도 일반성향 완료·형용사 시작·제출 재확인·제출 완료 화면 제거. 42문항/최소 5개 검증, 응답 수정, 제출 전 저장 대기 차단, 중복 제출 방지, 실패 후 재시도 유지. 이전 단계 DB·로컬 큐 복구 검증. |
| FR-04 결과 내비게이션 | 완료 | 화면 상단 `홈으로`와 `이용 종료`, 하단 `홈으로` 제공. 고객에게는 전체 결과를 웹 화면으로만 제공하며 PDF·인쇄·A4 미리보기 버튼은 없음(H절). 제출 응답 수정 버튼 없음. 홈 이동·조회 전후 결과 DB 행 동일. A4 출력용 컴포넌트는 관리자 화면용으로 유지. |
| FR-05 고객 세션 종료 | 완료 | 기존 `/api/session/logout` 연결. 응답 저장 성공 후 토큰 무효화, 실패 시 화면 유지·재시도 안내. 종료 후 원본 토큰의 세션/응답 API 접근 401 확인. 진행 중 동일 정보 재진입, 제출 후 재진입 차단, 뒤로가기/새로고침 차단, 다른 고객의 동일 기기 시작 확인. 결과 데이터 보존 확인. |
| FR-06 재사용·정리 | 완료 | 기존 이동 함수·저장 큐·진입/종료/제출 API·결과 컴포넌트를 재사용. 참조가 사라진 안내 JSX·제출 상태·스타일 삭제. 기존 테스트는 새 흐름에 맞춰 갱신. 신규 런타임 라이브러리·DB 스키마 변경 없음. |

### 사전 영향 분석과 세션 정책

- `STEP_ORDER`, `nextStep`, `prevStep`, `isStepReachable`, `resolveResumeStep`, `parseStepBody`, TestFlow 초기화/로컬 큐 복원을 함께 점검.
- 새 활성 단계는 `general-1`~`general-42`, `adjectives`, `review`의 44개. `part1-done`과 `adjectives-intro`는 호환 입력으로 유지하고 `adjectives`로 정규화.
- `/api/session/step`은 기존 파서를 사용하므로 이전 브라우저/큐의 요청도 허용한 뒤 새 단계로 저장. 과거 DB 전체를 갱신하거나 스키마를 바꾸지 않음.
- `/api/session/enter`와 `/api/session/logout` 구현은 변경하지 않음. 기존 로그아웃은 `token_hash`만 무효 값으로 바꾸고 쿠키를 지우며 응답·결과를 삭제하지 않음.
- 진행 중 세션은 종료 후 같은 정보로 재진입하면 `takeover`로 새 토큰을 발급하고 기존 응답을 이어감. 쿠키가 유효한 진행 중 세션은 `resume` 유지.
- 제출 완료 세션은 유효한 기존 쿠키만 `show_result`; 종료 후에는 `already_submitted`로 차단. 이 정책을 우회하지 않고 종료 확인 영역에 결과 재접근 불가 안내를 표시("이용을 종료하면 진단 결과를 다시 확인할 수 없습니다. 결과를 충분히 확인한 뒤 종료해 주세요."). PDF 저장 문구는 사용하지 않음.
- 정보 입력 화면은 기존 정책상 활성 세션이 있으면 자동으로 진단/결과로 이동함. 첫 문항에서 `이전`은 홈으로 이동해 입력 화면과 진단 사이의 리다이렉트 반복을 방지. 홈 이동은 세션을 종료하지 않음.
- 회귀 위험이 높은 부분은 응답 전송과 단계 저장의 순서, 자동 이동 타이머, 제출과 이동의 경합, 이전 토큰 접근, 출력 결과 동일성으로 정하고 검증.

## B. 변경 파일 목록

| 파일 | 변경 이유·내용 |
| --- | --- |
| `src/app/HomeSections.tsx` | 긴 소개를 짧은 안내와 접기/펼치기로 축소. 기존 StartAction 유지. |
| `src/app/home.module.css` | 모바일 첫 화면 여백·제목 크기 조정, 접기 스타일 추가, 삭제한 카드/진행 방법 스타일 정리. |
| `src/app/CustomerNavigation.tsx` (신규) | 공통 이전·홈·종료 UI. 저장 완료 확인, 종료 실패 안내, 동시 실행 방지, 문서 이동으로 클라이언트 캐시 초기화. BFCache 복원 시 재조회, 다른 탭 종료 이벤트 처리. |
| `src/app/CustomerNavigation.module.css` (신규) | 공통 이동 버튼, 종료 안내·오류, 48px 이상 터치 영역과 브라우저 인쇄 시 제외 스타일. |
| `src/app/c/[courseCode]/EntryForm.tsx` | 입력·동의 화면에 공통 내비게이션 연결. 기존 입력/자동완성/동의 검증 유지. |
| `src/app/c/[courseCode]/test/TestFlow.tsx` | 안내 단계 제거, 이전 값 정규화, 공통 내비게이션·타이머 취소 재사용, 제출/종료 중 응답 잠금, 저장 큐 배출 연결. |
| `src/app/c/[courseCode]/test/TestFlow.module.css` | 사라진 화면/확인 상태 스타일 제거, 형용사 하단 다음 버튼을 한 열로 정리. |
| `src/app/c/[courseCode]/test/ReviewScreen.tsx` | 최종 제출 한 화면으로 축소. 선택적 수정과 개수 요약 유지. ref로 중복 제출 차단, 성공 시 결과로 replace, 제출 중 부모 이동 버튼 잠금. |
| `src/app/c/[courseCode]/test/useResponseSaver.ts` | 저장 대기 중 새로고침/문서 이동 경고 추가. 기존 전송·재시도·소유자 큐 로직 유지. |
| `src/lib/session/progress.ts` | 활성 단계 축소와 이전 단계 정규화. 이동·도달 가능·이어하기에 일관 적용. |
| `src/lib/session/request.ts` | 이전 단계 요청도 검증 후 정규화해 `/api/session/step`에서 저장하도록 처리. |
| `src/app/c/[courseCode]/result/ResultClient.tsx` | 화면 상단 공통 홈·종료 연결. (정책 변경 후) A4 미리보기 상태·확대/축소·window.print·@page 주입 제거, 전체 웹 결과만 렌더링. |
| `src/app/c/[courseCode]/result/ResultScreen.tsx` | 홈 링크 추가. (정책 변경 후) PDF/인쇄 버튼과 `onPrintPreview` 제거. PrintLayout 내용은 변경 없이 관리자 화면에서 사용. |
| `src/app/c/[courseCode]/result/result.module.css` | 결과 상단 내비게이션 간격, 하단 홈 링크 정렬 추가. (정책 변경 후) 고객 전용 인쇄 버튼·미리보기 바·모바일/인쇄 영역 전환 규칙 제거. 관리자 A4 인쇄 규칙은 유지. |
| `src/lib/session/__tests__/progress.test.ts` | 44단계 순서·이전 이동·이어하기·과거 단계 호환 검증으로 갱신/확장. |
| `src/lib/session/__tests__/request.test.ts` | 과거 단계 요청의 정규화 기대값 반영. 잘못된 단계 거절 검증 유지. |
| `src/lib/session/__tests__/logoutRoute.test.ts` (신규) | 토큰 해시만 변경, 쿠키 삭제 순서, DB 실패, origin 차단, 무쿠키 종료, 재진입 정책 검증 5개. |
| `scripts/verify-mobile.mjs` | 기존 모바일 회귀 검증의 after 경로를 축소된 흐름과 버튼 이름에 맞게 갱신. 변경 전 비교용 before 경로 유지. |
| `scripts/verify-beta-ux.mjs` (신규) | 실제 Chromium·Supabase 전체 여정, 실패 주입, 중복 제출, 종료 정책, 과거 DB/큐 단계 복구, 스크린샷, 고객 출력 제한 검증. |
| `docs/beta-ux-report.md` (신규) | 영향 분석, 변경/삭제 근거, 검증 결과와 미검증 항목 기록. |

## C. 기존 코드 재사용 내역

- 기본 과정 조회 `getDefaultCourse`, 시작 CTA `StartAction`, 기존 `/c/{courseCode}` 라우팅.
- TestFlow의 응답/형용사 state, `go`, `goForward`, `nextStep`, `prevStep`, 응답 표시와 선택 UI.
- `useResponseSaver.flush/pendingSize/enqueue/enqueueStep`, 기존 `saveQueue`의 응답 우선·step 후순위 및 세션 소유자 구분.
- ReviewScreen 응답 요약, 일반성향 수정 목록, 형용사 수정, `/api/session/submit` 및 기존 서버 검증·저장·채점.
- `/api/session/logout`의 토큰 해시 무효화와 쿠키 삭제, `/api/session/enter`의 기존 5가지 분기.
- ResultScreen의 동일 ResultView 기반 웹 화면·A4 출력 레이아웃(A4는 관리자 화면에서만 사용).
- 기존 DB·콘텐츠·채점·관리자·결과 검증 스크립트/테스트.

## D. 삭제 코드 목록

| 삭제 대상 | 근거 |
| --- | --- |
| TestFlow의 `part1-done`, `adjectives-intro` 화면 JSX | 새 흐름에서 해당 화면으로 이동하지 않음. 설명은 형용사 화면 안으로 이전. |
| 단계 배열의 두 안내 단계 | 활성 이동 경로에서 제외. 값 호환은 별도 정규화로 유지. |
| ReviewScreen의 `Phase`, `confirm`, `done` 분기, 완료/재확인 UI | 최종 제출 한 번으로 결과까지 이동하도록 변경. |
| `next`, `confirmRef`, 완료/확인용 focus effect, `onBack` prop | 연결된 화면/하단 중복 이전 버튼 제거로 참조가 사라짐. |
| 개별 화면의 이전 버튼 | 공통 상단 내비게이션으로 대체. |
| TestFlow CSS의 `header`, `centerArea`, `confirm`, `confirmText` 관련 규칙 | 해당 JSX 참조 제거 후 전체 소스 검색으로 미사용 확인. |
| 홈의 `TYPES` 소개 상수와 카드/단계 카드 UI 및 CSS | 짧은 안내 목록과 상세 접기로 대체되어 참조가 사라짐. 결과 해석 데이터와 무관. |

기존 테스트를 삭제해 통과시키지 않았으며, 새 단계 순서/호환성 기대값으로 교체하고 종료 테스트를 추가함.

## E. 삭제 보류 항목

- `part1-done`, `adjectives-intro` **문자열 호환 처리**: DB와 이전 브라우저/저장 큐 때문에 유지. 화면 JSX만 제거.
- `review` 단계명: 최종 제출 화면에 계속 사용되며 DB 값 호환도 필요해 유지.
- `saveQueue` 전체 및 소유자 기록: 재진입·오프라인 복구·다른 고객 응답 혼입 방지에 필요. 변경하지 않음.
- 서버 제출·인증·채점·결과 및 관리자 기능: 호출 관계를 유지하는 보호 대상이며 정리 범위에서 제외.
- `verify-mobile.mjs`의 `before` 분기: 변경 전 커밋과 화면/동작을 비교하는 명시적 용도이므로 보존.
- 기존 ESLint 경고의 `TYPE_NAME`, `pad2`: 각각 관리자 상세/기존 결과 검증 스크립트에 있는 기존 항목. 이번 UI 제거로 새로 발생한 죽은 코드가 아니므로 범위를 넓혀 수정하지 않음.

## F. 테스트 결과

### 최종 실행 결과

| 명령/검증 | 결과 |
| --- | --- |
| `node --env-file=.env.local ./node_modules/vitest/vitest.mjs run` | (최초 구현 시점) 342개 통과, 건너뜀 0. 정책 변경 후 결과는 H절 참고. |
| `npx.cmd tsc --noEmit` | 통과, 오류 0. |
| `npm.cmd run lint` | 오류 0, 기존 경고 2 (`verify-admin-detail.mjs:TYPE_NAME`, `verify-step7.mjs:pad2`). 새 경고 0. |
| `npm.cmd run build` | Next.js 16.4.0 프로덕션 빌드 통과. |
| `node --env-file=.env.local scripts/verify-beta-ux.mjs` | (최초 구현 시점) 12개 검증 묶음 통과. 정책 변경 후 결과는 H절 참고. |
| `node --env-file=.env.local scripts/verify-mobile.mjs` | (최초 구현 시점) 37개 검증 통과, 스크린샷 18개. 실제 Chromium의 `isMobile`/`hasTouch` 환경에서 360·390px 확인. |
| `node --env-file=.env.local scripts/verify-home.mjs` | **11개 통과, 실패 0, 미검증 1**. 실제 운영 기본 과정의 비활성/없음 상태를 만들지는 않음. 해당 상태는 별도 가짜 PostgREST를 연결한 실제 앱/브라우저에서 검증. |
| `node --env-file=.env.local scripts/verify-step7.mjs` | **13개 통과**, 실패 0. 결과 표시·민감 값 미노출·권한·추천직업·결과 행 보존. (정책 변경 후 고객 출력 기능 제거 확인으로 갱신) |
| `node --env-file=.env.local scripts/verify-admin-results.mjs` | 단독 최종 실행 **8개 통과**. 인증/목록/필터/페이지 이동/데이터 보존. |
| `node --env-file=.env.local scripts/verify-admin-detail.mjs` | (최초 구현 시점) **12개 통과**. 고객·관리자 결과지 글자 단위 동일, 30가지 1·2순위 조합 A4 1장·잘림/겹침 없음, PDF 출력 확인. |
| `git diff --check` | 통과. |
| 보호 대상 경로의 `git diff --exit-code HEAD -- ...` | 콘텐츠·채점·결과 생성·관리자·DB/스키마·저장 큐·진입/종료/제출/응답 API 변경 없음 확인. |

브라우저 스크립트는 로컬 프로덕션 서버 `http://localhost:3003`에서 실행. 기존에 설치된 Playwright를 `PLAYWRIGHT_MODULE`로 지정했으며 package.json/lockfile/런타임 의존성은 변경하지 않음. `VERIFY_BASE_URL`, `MOBILE_BASE_URL`, `MOBILE_OUTPUT`으로 서버와 증거 위치 지정 가능.

### 검증 범위와 증거

- `scratch/beta-ux/verification.json`: 신규 고객 여정 12개 검증 묶음.
- `scratch/beta-ux/`: 360·390·1440px 홈/입력/문항/형용사/최종 제출/결과 스크린샷. (정책 변경 후 고객 미리보기 스크린샷·`result.pdf`는 생성하지 않음)
- `scratch/beta-mobile/checks.json`: 모바일 37개 검증과 18개 화면의 넘침/버튼 크기/글자 크기 측정.
- `scratch/home-mobile.png`, `scratch/home-desktop.png`: 기존 홈 검증기 증거.
- 위 `scratch` 자료는 기존 gitignore에 따라 커밋 대상에서 제외. 합성 테스트 고객 자료만 포함.
- 모든 실제 DB 검증은 무작위 과정과 테스트 고객을 사용하고 종료 시 해당 과정/하위 데이터만 정리·삭제 여부를 확인. 운영 기본 과정은 읽기만 수행.
- 브라우저 JavaScript 예외 0. 결과 행·응답 데이터의 보존을 전후 비교. 모바일 저장 응답을 별도로 집계해 일반/형용사 점수·합계·순위·추천직업과 대조.

### 중간 실패와 처리

- 단계 변경 직후 기존 기대값에 의존하던 테스트 6개가 실패했으며, 새 단계 순서/정규화 검증으로 갱신한 뒤 전체 테스트를 재실행해 통과.
- 제한된 실행 환경에서는 DB 연결이 `EACCES`로 실패함. 네트워크 접근이 허용된 실행으로 재검증했고 실제 DB 7개를 포함한 342개 모두 통과.
- 관리자 목록 스크립트 첫 실행에서 다른 검증기의 임시 세션이 전체 건수에 포함되어 `121 != 117` 실패. 다른 DB 검증 종료 후 단독 재실행해 8개 모두 통과. 관리자 코드는 변경하지 않음.
- 신규 브라우저 검증기의 접근성 선택자/스트리밍 로딩 대기 문제를 보완. 로딩 화면을 잡은 스크린샷은 화면 로딩 후 다시 확보. 최종 실행 결과와 구분함.

## G. 잔여 위험·미검증

1. **실제 스마트폰 미검증**: Chromium 모바일 에뮬레이션은 통과했으나 iOS Safari/Android 실제 기기, 가상 키보드, 주소창·안전영역·기기별 BFCache는 현장 확인 필요.
2. **관리자 OS 인쇄 대화상자·실물 프린터 미검증**: 관리자 A4 미리보기·Chrome PDF 생성·30조합 1장 출력은 확인. 실제 PDF 저장 대화상자/프린터 드라이버 설정은 별도 확인 필요.
3. **운영 기본 과정 비활성/없음의 직접 조작 미실행**: 운영 데이터를 바꾸지 않았음. 상태별 서버·UI 동작은 가짜 DB 기반 실제 앱/브라우저와 단위 테스트로 확인.
4. **제출 후 이용 종료 정책**: 종료 후 동일 정보로도 결과 재접근 불가. 기존 정책이며 화면에 안내함. 재열람 정책 변경은 이번 작업에 포함하지 않음.
5. **서버 로그 관찰**: 일부 스트리밍 요청에서 prerender 완료 후 fetch 취소 메시지가 기존 서버 try/catch 경로에 출력됨. 최종 빌드·API 검증·브라우저 예외 검증은 통과. 수정 전 실행과의 로그 재현 비교는 하지 않아 새 경고/기존 경고로 단정하지 않으며, 관련 서버 경로는 변경하지 않음.
6. 기존 개발 서버는 유지. 검증용으로 시작한 별도 서버만 종료하고, 배포·운영 설정 변경은 수행하지 않음.

## H. 고객 PDF·인쇄·A4 미리보기 제거 (정책 변경)

### 배경과 확정 정책

- 의뢰인 요구에 따라 고객이 결과를 PDF로 내려받거나 인쇄·A4 미리보기를 쓰는 기능을 제공하지 않기로 확정.
- 고객은 전체 RIASEC 진단 결과(1·2순위 해석, 추천직업, 6개 유형 점수와 그래프)를 웹 화면에서 확인한다.
- 관리자는 기존과 동일하게 A4 결과지를 조회하고 PDF 출력·인쇄할 수 있다.
- 고객 이용 종료 안내와 홈 소개 문구에는 PDF 저장 문구를 쓰지 않는다.
- **범위 한계**: 브라우저 자체 인쇄(Ctrl+P)와 화면 캡처는 서비스에서 완전히 차단하는 범위가 아니다. 웹 결과가 인쇄 시 빈 화면이 되도록 막지도 않는다.

### 구현 변경

| 파일 | 내용 |
| --- | --- |
| `ResultClient.tsx` | A4 미리보기 상태·확대/축소·`window.print`·`@page` 주입·숨겨진 A4 영역 제거. 상단 내비게이션과 모바일 결과만 렌더링. |
| `ResultScreen.tsx` | PDF/인쇄 버튼과 `onPrintPreview` 제거. `홈으로` 유지. `mode="print"`는 관리자 화면에서 그대로 사용. |
| `result.module.css` | 고객 전용 인쇄 버튼·미리보기 바·영역 전환 규칙 제거. 관리자 A4 규칙 유지. |
| `CustomerNavigation.tsx` | 종료 안내를 "이용을 종료하면 진단 결과를 다시 확인할 수 없습니다. 결과를 충분히 확인한 뒤 종료해 주세요."로 변경. |
| `HomeSections.tsx` | 결과 안내를 "전체 결과를 웹 화면에서 확인"으로, 종료 안내를 "충분히 확인한 뒤 종료"로 변경. |
| 테스트·검증 스크립트 | 고객 출력 부재와 관리자 출력 유지를 검증하도록 갱신(`adminPrint.test.tsx`, `home.test.tsx`, `verify-step7/admin-detail/mobile/beta-ux.mjs`). |

관리자 컴포넌트(`AdminResultSheet`)와 서버·DB·채점·결과 생성 코드는 변경하지 않음.

### 검증 결과 (2026-10-15, 로컬 프로덕션 서버)

| 검증 | 결과 |
| --- | --- |
| Vitest | 338개 통과, 7개(실제 DB 테스트) 건너뜀. 이번 정책 변경 검증에서는 DB 테스트를 실행하지 않음. |
| `tsc --noEmit` | 통과. |
| ESLint | 오류 0, 기존 경고 2(`TYPE_NAME`, `pad2`). |
| `next build` | 성공. |
| `verify-step7.mjs` | 13개 통과, 실패 0. 고객 결과에 출력 UI·`data-print-sheet`·`@page` 없음, 점수표·추천직업·해설 제목은 웹 화면에 한 번씩. |
| `verify-admin-detail.mjs` | 12개 통과. 고객 웹 결과와 관리자 출력의 해석·추천직업 34개 내용 일치, 고객 A4 없음, 관리자 30가지 조합 A4 1장·PDF 1장. |
| `verify-mobile.mjs` (360·390px) | 전 항목 PASS. 고객 결과에 PDF/인쇄/A4 버튼·숨겨진 시트·다운로드 링크 없음. |
| `verify-beta-ux.mjs` | 13개 통과. `/result/print`·`/pdf`·`/preview`, `/api/session/pdf`·`print`는 404. `?print=1`·`?mode=print`·`?preview=true`·`?download=pdf`로도 출력 UI 미노출. 고객 쿠키로 `/admin/results*` 접근 시 `/admin/login`으로 307. |

최종 검수 중 `verify-beta-ux.mjs`가 쿼리 검사 후 페이지가 `?download=pdf`에 남아 `endsWith("/result")` 검사에서 실패했다. 제품 버그가 아닌 테스트 문제였고, 루프 뒤에 `/result`로 되돌아가는 이동을 추가해 통과시켰다.

### 잔여 사항

- 검증은 Chromium 에뮬레이션과 서버 응답 기준이며, 브라우저 자체 인쇄·화면 캡처는 차단 대상이 아님.
- 실제 기기와 관리자 PC의 인쇄 대화상자·프린터는 G절과 같이 미검증.
- 검증 스크립트의 Playwright는 프로젝트 의존성에 없어 `PLAYWRIGHT_MODULE`로 경로를 지정해야 한다.

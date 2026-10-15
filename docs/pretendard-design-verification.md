# Pretendard 및 결과지 디자인 검증

기준: 로컬 `main` / `863a676d1d3cec687d9c100bbfa026742320f04b`, 2026-10-15.
기존 미커밋 상태의 종합 해석·2페이지 결과지를 보존하고 그 위에 적용했다.
커밋·푸시·배포는 수행하지 않았다.

## 수정 파일

| 파일 | 변경 이유 |
| --- | --- |
| `src/app/layout.tsx` | 공식 Pretendard Variable v1.3.9를 `next/font/local`로 루트에 적용 |
| `src/app/globals.css` | 공통 폰트 변수, 16px 기본 본문, 버튼·입력 요소의 서체 상속 |
| `src/app/fonts/PretendardVariable.woff2` | 변경하지 않은 공식 로컬 폰트 |
| `src/app/fonts/OFL.txt` | SIL OFL 1.1 원문 및 저작권 고지 보존 |
| `src/app/fonts/README.md` | 출처·버전·SHA-256 기록 |
| `src/app/home.module.css` | 모바일 제목 24px, 본문·시작 버튼 16px, 섹션 제목 18px |
| `src/app/c/[courseCode]/result/result.module.css` | 공통 블루 팔레트, 순위 카드 위계, 핵심 문장·항목 라벨 강조, 표 구분선 최소화, 인쇄 글자 크기·여백 개선, 모바일 세로 배치 |
| `src/app/admin/results/[sessionId]/AdminResultSheet.tsx` | 인쇄 버튼에서 폰트 로딩 완료 후 기존 `window.print()` 실행 |
| `scripts/verify-admin-detail.mjs` | 폰트 로딩 대기 및 PDF의 Pretendard 이름·내장 글리프 검사 |
| `scripts/verify-beta-ux.mjs` | 화면별 폰트 상속과 모바일 순위 카드 세로 배치 검증 |

기존 `ResultScreen.tsx`와 콘텐츠·채점·결과 모델·API·인증 코드는 이번 작업에서 변경하지 않았다.
시작 시 기록한 SHA-256과 비교해 기존 문안·점수·추천직업·서버 코드가 그대로임을 확인했다.

## 적용 방식과 화면

- 외부 CDN 요청 없이 Next.js가 동일 출처에서 WOFF2를 제공한다. 100–900 가변 굵기를 사용한다.
- 루트 CSS 변수 한 곳에서 폰트를 지정한다. 개별 컴포넌트는 기존 상속을 유지한다.
- Deep Navy `#234A86`, Soft Blue `#DDE8F8`, Cool Gray `#F3F6FA`를 결과지에 적용했다.
- 고객 화면은 기존 웹 결과 전체를 유지한다. 작은 화면에서는 두 순위와 상세 내용을 세로로 표시한다.
- 관리자 1페이지의 육각형 그래프와 6개 점수, 2페이지의 좌우 비교 구조를 유지한다.
- 인쇄 제목 20pt, 유형명 17pt, 영역 제목 12.5pt, 핵심 문장 12pt, 본문 11pt, 보조정보 최소 10pt이다.
- 고객 PDF·인쇄 제한과 관리자 출력 권한을 유지한다.

## 실행 결과

| 실행 | 결과 |
| --- | --- |
| `npm.cmd test` | 392 통과, DB 환경변수가 필요한 7개 건너뜀 |
| `node --env-file=.env.local ./node_modules/vitest/vitest.mjs run` | 26개 파일, 399개 테스트 통과, 실패·건너뜀 0 |
| `npx.cmd tsc --noEmit` | 통과 |
| `npm.cmd run lint` | 오류 0, 기존 미사용 변수 경고 2개 (`TYPE_NAME`, `pad2`) |
| `npm.cmd run build` | 프로덕션 빌드 통과 |
| `node --env-file=.env.local scripts/verify-admin-detail.mjs` | 12항목 통과, 실패 0. 관리자 접근 제한·고객 출력 차단·내용 일치·30개 조합의 2페이지 출력 검증 |
| `scripts/verify-beta-ux.mjs` (기존 Playwright 경로 지정) | 18항목 통과, 실패 0. 360·390·1440px에서 고객 여정, 글꼴 상속, 모바일 순위 카드 세로 배치, 넘침, 저장·제출·세션·콘텐츠 보호 검증 |

관리자 30개 조합 모두 PDF 2페이지이며 잘림·겹침이 없었다. 가장 빠듯한 RI 조합의
1·2페이지 안전 여백은 각각 77.6px·121.4px, 최소 글자 크기는 13.3px(10pt)이었다.
고의로 긴 문장을 주입한 음성 검증에서는 측정기가 넘침을 감지했다.

생성 PDF는 약 210×297mm 두 페이지임을 PDF.js로 확인하고 두 페이지를 PNG로 렌더링해 검토했다.
한글·영문·숫자·기호, 추천직업 목록과 긴 해설이 정상 표시된다.
Chrome은 Pretendard를 Type3 글리프 프로그램으로 포함했으며, PDF 내 FontName과 CharProcs를 확인했다.
글꼴이 없는 기기에서도 이 내장 글리프를 통해 표시된다. PDF의 텍스트 복사 품질은 별도 보장하지 않는다.

## 검증 자료 및 한계

- `scratch/interpretations-admin/result.pdf`: 테스트용 결과 PDF
- `scratch/interpretations-admin/pdf-page-1.png`, `pdf-page-2.png`: 실제 PDF 렌더링
- `scratch/interpretations-admin/layout-checks.json`: 30개 조합 측정값
- `scratch/beta-ux/`: 모바일·PC 화면 캡처 및 검증 결과
- `scratch/font-design-baseline/hashes.json`: 작업 시작 시 파일 해시

초기 브라우저 실행은 테스트 서버의 DB 네트워크 제한 때문에 실패했다. 네트워크가 허용된
로컬 서버로 다시 실행했다. PDF 검사도 Chrome의 Type3 내장 글리프 형식을 인식하도록 수정했다.
추가한 세로 배치 테스트의 선택자 인코딩 오류를 수정한 뒤 최종 18항목 전체가 통과했다.
검증용 PDF.js는 ignored `scratch`에만 내려받았으며 프로젝트 의존성에는 추가하지 않았다.

실제 스마트폰, Safari·Firefox, 물리 프린터, 운영 배포 환경은 미검증이다.
동작 검증은 로컬 프로덕션 빌드와 Chrome 기준이며 테스트용 임시 DB 과정만 생성·삭제했다.

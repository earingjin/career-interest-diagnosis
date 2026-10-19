# career-interest-diagnosis

Next.js(App Router, TypeScript) + Supabase 기반 직업흥미 진단 앱. 현재는 빈 골격 단계입니다.

## 로컬 실행 방법

```bash
npm install
cp .env.example .env.local   # 값을 채운다 (.env.local 은 git 에 올리지 않는다)
npm run dev
```

브라우저에서 아래 주소를 확인합니다.

- http://localhost:3000/
- http://localhost:3000/c/TEST01
- http://localhost:3000/api/health

빌드 확인: `npm run build`

## 환경 변수

`.env.example` 을 참고해 `.env.local` 에 작성합니다.

| 이름 | 설명 | 노출 범위 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 브라우저 + 서버 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 | 브라우저 + 서버 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 | **서버 전용** (절대 `NEXT_PUBLIC_` 을 붙이지 않는다) |

`src/lib/supabase/server.ts` 는 `server-only` 로 보호되어 클라이언트 코드에서 import 하면 빌드가 실패합니다.

## 배포 방법 (Vercel)

1. 이 저장소를 GitHub 에 올린다.
2. Vercel 에서 **Add New → Project** 로 저장소를 가져온다. (Framework Preset: Next.js, 기본 설정 그대로)
3. **Settings → Environment Variables** 에 위 세 변수를 등록한다. (Production / Preview 모두)
4. **Deploy** 를 누른다.
5. 배포 주소의 `/`, `/c/TEST01`, `/api/health` 가 열리는지 확인한다.

## 관리자 계정 설정

PC 관리자 페이지(`/admin`)는 고객 진단과 완전히 분리된 단일 관리자 계정으로 로그인합니다. 계정 정보는 서버 환경 변수로만 관리하며 코드에는 없습니다.

| 이름 | 설명 |
| --- | --- |
| `ADMIN_ID` | 관리자 ID |
| `ADMIN_PASSWORD_HASH` | 비밀번호의 scrypt 해시 (원문 비밀번호가 아님) |
| `ADMIN_SESSION_SECRET` | 로그인 쿠키 서명용 비밀키. 32자 이상 무작위 문자열 |

세 값 중 하나라도 없거나 올바르지 않으면 관리자 로그인과 `/admin`, `/api/admin` 접근이 모두 거부됩니다(오류 시 항상 닫힘).

### 1. 비밀번호 해시 만들기

```bash
node scripts/hash-admin-password.mjs
```

비밀번호(12자 이상)를 두 번 입력하면 `scrypt:32768:8:1:...` 형식의 한 줄이 출력됩니다. 비밀번호는 명령 인자로 받지 않아 셸 기록에 남지 않으며, 입력해도 화면에 보이지 않습니다. 그 한 줄을 `ADMIN_PASSWORD_HASH` 에 붙여 넣습니다. 달러 기호를 쓰지 않는 형식이라 따옴표 없이 그대로 적어도 됩니다.

### 2. 세션 비밀키 만들기

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 3. 환경 변수에 넣기

`.env.local`(로컬) 또는 Vercel 의 Environment Variables(서버 전용, `NEXT_PUBLIC_` 을 붙이지 않음)에 세 값을 등록하고 서버를 다시 시작합니다. 이후 `/admin` 으로 접속하면 로그인 화면이 나타납니다.

### 동작 요약과 운영 시 주의

- 로그인하면 `jd_admin` 쿠키(HttpOnly, SameSite=Strict, 운영에서는 Secure)가 발급되며 8시간 뒤 만료됩니다. 고객용 `jd_session` 쿠키와 이름도 비밀키도 공유하지 않습니다.
- 로그인 실패는 15분 동안 IP 당 5회, 계정 전체 20회까지 허용하며, 넘으면 올바른 비밀번호도 거부(429)합니다. 기록은 기존 `auth_attempts` 테이블에 원본 IP 없이 해시로만 남습니다.
- 로그인 요청은 같은 출처(Origin)에서 온 것만 받습니다. 개발 중 다른 주소(예: 휴대폰)에서 접속하려면 `ALLOWED_ORIGINS` 를 설정합니다.
- 비밀번호를 바꾸려면 새 해시를 만들어 `ADMIN_PASSWORD_HASH` 를 교체하세요. 이전에 발급된 관리자 세션은 자동으로 무효가 됩니다. 비밀키를 바꿔도 모든 세션이 끝납니다.
- 세션은 서버에 저장되지 않는 서명 쿠키라서, 로그아웃은 해당 브라우저의 쿠키를 지우는 것입니다. 쿠키가 유출된 경우를 끊으려면 위처럼 비밀번호 해시나 비밀키를 교체합니다.
- `/admin` 영역은 검색 엔진에 노출되지 않도록 설정되어 있습니다. 운영 환경은 반드시 HTTPS 로 접속하세요.

### 날짜별 진단 완료 목록

`/admin/results`에서 한국 시간 기준 완료 날짜를 선택하고 조회합니다. 기본값은 한국 기준 오늘이며,
`sessions.submitted_at`이 해당 날짜에 속하는 `submitted` 세션만 표시합니다.
닉네임이 같아도 세션 ID별로 별도 행을 표시하고, 결과가 없는 완료 세션은 확인 필요 상태로 남깁니다.

`휴대폰` 칸에는 진단 시작 때 입력한 휴대폰 뒷자리 4자리를 보여 동명이인을 구분합니다. DB 에는 지금처럼
`sessions.phone_key`(뒷자리의 HMAC-SHA256 값)만 저장하고 평문 뒷자리 칸은 만들지 않습니다. 관리자 인증을 통과한 뒤
서버에서 `SESSION_HASH_SECRET` 으로 0000~9999 를 모두 계산해 역조회하므로, 이미 완료한 고객도 별도 데이터 변환 없이
표시됩니다(`src/lib/admin/phoneLast4.ts`). `phone_key` 원값은 화면과 응답에 내보내지 않습니다.

- `SESSION_HASH_SECRET` 을 바꾸면 이전 비밀키로 저장된 세션은 뒷자리를 복원할 수 없어 `확인 불가` 로 표시되고, 재접속도 되지 않습니다. 운영 중에는 바꾸지 않습니다.
- 뒷자리는 1만 가지뿐이라 HMAC 은 비밀키를 가진 쪽에게는 사실상 가명 처리에 가깝습니다. 비밀키는 서버 환경 변수로만 두고 클라이언트·로그에 남기지 않습니다.

목록은 최대 50명씩 이전/다음으로 이동합니다. 완료시각과 세션 ID를 기준으로 이동해 같은 시각의 고객도
누락되지 않으며, 조회 중 더 최근에 완료한 고객은 첫 페이지를 다시 조회하면 확인할 수 있습니다.
목록 조회는 서버에서 인증 후 읽기 전용으로 수행하며, 개별 결과 상세와 인쇄는 아직 제공하지 않습니다.

검증: `npm test`, `npx eslint src vitest.config.mjs`, `npm run build`.
로컬 실제 DB/HTTP 검증은 빌드 후 `node --env-file=.env.local scripts/verify-admin-results.mjs`로 실행합니다.
이 검증은 무작위 테스트 과정과 세션/결과를 만들고 종료 시 해당 과정과 테스트 로그인 기록만 삭제합니다.
기존 고객 데이터와 로컬 관리자 설정은 변경하지 않습니다.

## 홈페이지와 프로토타입 기본 과정

고객은 홈페이지(`/`)에서 [직업흥미 진단 시작하기] 를 눌러 바로 진단을 시작합니다. QR 코드와 과정 선택 화면은 쓰지 않습니다. 버튼은 DB 에서 **기본 과정으로 지정된 활성 과정** 한 개의 참여자 입력 화면(`/c/{과정 코드}`)으로 연결됩니다. 과정 코드나 ID 는 코드에 적혀 있지 않습니다.

- 기본 과정이 없으면 "지금은 진단을 시작할 수 없어요", 비활성이면 "진행하고 있지 않아요", 조회에 실패하면 "잠시 문제가 생겼어요" 안내만 보여주고 어디로도 연결하지 않습니다.
- 홈페이지는 접속할 때마다 DB 를 확인하므로 SQL 로 바꾼 상태가 바로 반영됩니다.
- 기존 `/c/{과정 코드}` 주소와 진단·결과 흐름은 그대로입니다.

### 준비 (처음 한 번)

1. SQL Editor 에서 `supabase/migrations/20261016000000_course_default.sql` 을 실행합니다. `courses` 에 `is_active`(기본 true), `is_default`(기본 false) 컬럼이 생기며, 기본 과정은 한 개만 지정할 수 있습니다.
2. 기본 과정을 지정합니다. 새로 만들 때는 아래를 실행합니다(코드는 무작위 24자).

```sql
insert into courses (code, name, is_default)
values (translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_'), '직업흥미 진단 프로토타입', true);
```

이미 있는 과정을 쓰려면 `update courses set is_default = false where is_default;` 후 `update courses set is_default = true where code = '과정 코드';` 를 실행합니다.

### 운영 중

- 진행 중단: `update courses set is_active = false where is_default;`
- 다시 열기: `update courses set is_active = true where is_default;`

마이그레이션을 실행하기 전에는 홈페이지가 안내만 보여줍니다(기존 `/c/{과정 코드}` 진단은 영향이 없습니다).

### 확인

`npm run build` 후 `node --env-file=.env.local scripts/verify-home.mjs` 로 홈 → 시작 버튼 → 참여자 입력 화면 이동과 기본 과정 상태별 동작을 브라우저로 확인할 수 있습니다.

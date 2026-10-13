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

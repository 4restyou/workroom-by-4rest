# WORKROOM by 4REST

Vite + React + TypeScript + Tailwind CSS + Supabase 기반의 1차 MVP입니다.

## 실행

```bash
npm install
npm run dev
```

## 환경 변수

`.env.example`을 `.env`로 복사하고 Supabase 값을 입력합니다.

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ADMIN_EMAILS=admin@example.com
```

`VITE_ADMIN_EMAILS`는 프론트엔드 UX용 보조 체크입니다. 실제 관리자 권한은 Supabase
`profiles.role = 'admin'`과 RLS 정책으로 제어합니다.

## Supabase

`supabase/schema.sql`을 Supabase SQL editor에서 실행합니다.

1. Supabase Auth에서 관리자 계정을 만듭니다.
2. `auth.users`의 해당 사용자 UUID를 확인합니다.
3. `profiles`에 `role = 'admin'`으로 등록합니다.

## 배포

Netlify에서 이 폴더를 사이트 루트로 연결하고 환경 변수를 등록합니다. `netlify.toml`에
SPA rewrite와 빌드 설정이 포함되어 있습니다.

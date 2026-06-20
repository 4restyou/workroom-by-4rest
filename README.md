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
VITE_ADMIN_EMAILS=colorfg@gmail.com
```

`VITE_ADMIN_EMAILS`는 프론트엔드 UX용 보조 체크입니다. 실제 관리자 권한은 Supabase
`profiles.role = 'admin'`과 RLS 정책으로 제어합니다.

## 회원 / 관리자

- 회원가입과 로그인은 `/login`에서 Google OAuth로 진행합니다.
- 로그인한 회원은 `/account`에서 이름, 연락처, 주소를 관리하고 예약 상태 알림을 확인합니다.
- 관리자는 `profiles.role = 'admin'`이어야 `/admin/reservations`, `/admin/members`, `/admin/stats`, `/admin/settings`에 접근할 수 있습니다.
- 신규 회원은 기본적으로 `profiles.membership_status = 'approved'`로 생성됩니다. 예약은 관리자가 확인 후 확정합니다.

## 운영 기준

- 운영 시간: 09:00-22:00
- 기본 이용권: 3시간권 12,000원
- 연장: 좌석 여유가 있을 때 1시간 단위, 4,000원
- 종일권: 09:00-22:00, 40,000원
- 주간권: 월-금 09:00-22:00, 149,000원
- 월권 자유석: 4주 기준, 199,000원
- 월권 지정석: 4주 기준, 299,000원
- 온라인 결제: 예약 확인 문자에 포함된 결제 링크에서 문자 수신 후 2시간 이내 결제
- 현장 결제: 방문 시 바로 결제 가능
- 취소: 3시간권/종일권은 예약 시간 전까지 당일 취소 가능
- 유예: 이용 종료 후 15분까지 유예, 이후 1시간 추가 요금 적용

Supabase Auth 설정에서 Google provider를 켜고, Site URL과 Redirect URL에 배포 도메인을 등록해야 합니다.
로컬 개발 시에는 `http://localhost:5173/account`, `http://localhost:5173/admin/reservations`도 추가합니다.

## 카카오톡 알림

예약 신청/확정 알림을 카카오톡으로 자동 발송하려면 프론트엔드가 아니라 서버 함수가 필요합니다.
Kakao Developers의 카카오톡 메시지 API는 같은 서비스 사용자/친구 동의 기반 메시지에 가깝고, 고객 예약 알림은 보통
카카오비즈니스 알림톡/상담톡 또는 비즈메시지 대행 API로 구현합니다.

권장 구조:

1. Supabase Edge Function에서 예약 생성/상태 변경 이벤트를 받습니다.
2. 서버 환경 변수에 카카오/대행사 API 키를 저장합니다.
3. 승인된 알림톡 템플릿으로 고객과 관리자에게 메시지를 보냅니다.
4. 발송 결과를 별도 테이블에 저장해 `/account`와 관리자 화면에서 재확인합니다.

## Supabase

`supabase/schema.sql`을 Supabase SQL editor에서 실행합니다.

1. Supabase Auth에서 관리자 계정을 만듭니다.
2. `auth.users`의 해당 사용자 UUID를 확인합니다.
3. `profiles`에 `role = 'admin'`으로 등록합니다.

이미 운영 중인 Supabase 프로젝트에는 `supabase/operational-hardening.sql`도 한 번 실행합니다.
이 SQL은 예약 인원/시간 데이터 검증, 이용권 중복 방지, 예약 보관 처리를 위한
`deleted_at` 컬럼을 추가합니다.

## 배포

Netlify에서 이 폴더를 사이트 루트로 연결하고 환경 변수를 등록합니다. `netlify.toml`에
SPA rewrite와 빌드 설정이 포함되어 있습니다.

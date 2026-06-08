# Supabase 스키마 / 마이그레이션

## 두 파일의 관계

- **`schema.sql`** — 전체 스키마를 한 번에 적용하는 **멱등(idempotent) 파일**.
  새 프로젝트 셋업이나 "전부 다시 적용"할 때 이 파일 하나만 SQL 에디터에 붙여
  실행하면 됩니다. (`create table if not exists`, `drop policy if exists` 등으로
  여러 번 실행해도 안전)
- **`migrations/`** — 변경 이력을 시간순으로 남기는 **버전드 마이그레이션**.
  `0001_baseline.sql`은 현재 시점의 전체 스키마(=`schema.sql`)와 동일합니다.

## 앞으로 스키마를 바꿀 때

1. `migrations/` 에 다음 번호의 파일을 추가합니다. 예: `0002_payments.sql`
   - 그 파일에는 **이번 변경분만** (새 테이블/컬럼/정책/트리거) 넣습니다.
   - 멱등하게 작성하세요(`add column if not exists`, `create or replace`,
     `drop ... if exists` 등).
2. 같은 변경을 `schema.sql` 에도 반영해 둡니다(전체 셋업 파일을 최신으로 유지).
3. 운영 DB 적용:
   - Supabase 대시보드 SQL 에디터에서 **새 마이그레이션 파일만** 순서대로 실행, 또는
   - Supabase CLI 연결 시 `supabase db push`.

## 적용 순서 (대시보드 수동 적용 기준)

- 신규 DB: `schema.sql` 1회 실행.
- 기존 DB 업데이트: 아직 적용하지 않은 `migrations/*.sql` 을 번호 순서대로 실행
  (또는 `schema.sql` 재실행 — 멱등이라 안전).

---

# 예약 문자 자동발송 (Solapi / CoolSMS)

`supabase/functions/reservation-sms` 가 예약 **생성/상태변경** 시 문자를 보냅니다.
- 새 예약(INSERT) → 관리자(`ADMIN_PHONE`)에게 "새 예약 신청" 알림
- 확정/취소/노쇼(UPDATE) → 예약자(`phone`)에게 안내

> 인앱 알림(종 아이콘)은 그대로 동작하고, 그 위에 문자가 추가됩니다.

## 1) Solapi 준비
1. https://solapi.com 가입 → **API Key / API Secret** 발급
2. **발신번호 등록**(010-4931-3298 등 본인 번호 인증)
3. 문자 발송용 **포인트 충전**

## 2) 함수 배포 (Supabase CLI)
```bash
supabase functions deploy reservation-sms --no-verify-jwt
```

## 3) 시크릿 설정
```bash
supabase secrets set \
  SOLAPI_API_KEY=발급키 \
  SOLAPI_API_SECRET=발급시크릿 \
  SMS_SENDER=01049313298 \
  ADMIN_PHONE=01049313298
```
> 시크릿이 없으면 함수는 **발송하지 않고 로그만** 남기므로, 웹훅을 먼저 연결해도 안전합니다.

## 4) Database Webhook 연결 (대시보드)
Supabase 대시보드 → **Database → Webhooks → Create a new hook**
- Table: `reservations`
- Events: **Insert**, **Update** 체크
- Type: **Supabase Edge Functions** → `reservation-sms` 선택
  (또는 HTTP Request, POST, URL = `https://<프로젝트ref>.functions.supabase.co/reservation-sms`)

## 5) 테스트
- 관리자에서 예약을 **확정**으로 바꾸면 예약자 번호로 문자가 가야 합니다.
- 안 오면 함수 **Logs**(대시보드 → Edge Functions → reservation-sms → Logs)에서
  `secrets missing` 인지 `solapi error` 인지 확인하세요.

## 알림톡으로 확장
나중에 카카오 알림톡으로 바꾸려면, 카카오 비즈니스 채널 + 알림톡 템플릿(심사)을
Solapi에 등록한 뒤, `sendSms` 의 Solapi 호출을 `kakaoOptions`(pfId/templateId)를 포함한
알림톡 발송으로 바꾸면 됩니다(같은 `/messages/v4/send` 엔드포인트).

---

# 온라인 결제 (Toss Payments) — 확정 후 결제

흐름: 관리자가 예약을 **확정** → 회원이 **내정보 > 예약현황**에서 `결제하기` →
Toss 결제창 → `/payment/success` 에서 **confirm-payment 함수**가 secretKey로
승인·금액검증 후 예약을 `결제완료`로 바꿉니다.

## 1) Toss Payments 키
- https://docs.tosspayments.com — **clientKey(공개)**, **secretKey(비밀)** 발급
- 테스트 키로 먼저 검증 가능:
  - clientKey: `test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm`
  - secretKey: `test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6`
- 실제 결제는 가맹 심사 완료 후 **라이브 키**로 교체.

## 2) 프론트 키 (Netlify 환경변수)
Netlify → Site settings → Environment variables 에 추가 후 **재배포**:
```
VITE_TOSS_CLIENT_KEY=test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm
```
(키가 없으면 결제 버튼 대신 "결제 대기"로 표시됩니다.)

## 3) confirm-payment 함수 배포 + 시크릿
- 대시보드 Edge Functions → 함수 `confirm-payment` 생성 → 코드 붙여넣기 →
  **Verify JWT OFF** → Deploy
- 시크릿:
```
supabase secrets set TOSS_SECRET_KEY=test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6
```
  (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase가 자동 제공)

## 4) 스키마
`payment_key` 컬럼이 필요합니다 → `migrations/0003_payment.sql`(또는 `schema.sql`) 적용.

## 5) 테스트
- 회원으로 예약 → 관리자 확정 → 예약현황에서 `결제하기` → 테스트 카드로 결제
- 성공하면 예약현황에 **결제완료** 배지가 보여야 합니다.
- 안 되면 confirm-payment **Logs** 확인.

## 6) 취소·환불 (refund-reservation 함수)
회원이 예약현황에서 결제완료된 예약을 취소하면 Toss 결제를 자동 환불합니다.
**정책: 예약 시작 시간 전까지만 취소·환불 가능** (이후에는 취소 버튼이 사라지고
"예약 시간이 지나 취소·환불이 불가합니다" 안내).

- 대시보드 Edge Functions → 함수 `refund-reservation` 생성 → 코드 붙여넣기 →
  **Verify JWT ON** → Deploy
  - (호출자 본인 토큰으로 소유권을 서버에서 재검증하므로 JWT 검증을 켭니다.)
- 시크릿은 `confirm-payment` 와 동일한 `TOSS_SECRET_KEY` 를 그대로 사용
  (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` 자동 제공).
- 미결제(무료/대기) 예약 취소는 서버 호출 없이 상태만 `canceled` 로 변경됩니다.
- 환불 성공 시 `payment_status` 가 `refunded` 로 바뀌고 예약현황에 **환불완료** 배지 표시.

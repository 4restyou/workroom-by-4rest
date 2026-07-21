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
  ADMIN_PHONE=01049313298 \
  WEBHOOK_SECRET=충분히_긴_랜덤문자열
```
> Solapi 시크릿이 없으면 함수는 **발송하지 않고 로그만** 남기므로, 웹훅을 먼저 연결해도 안전합니다.
> `WEBHOOK_SECRET`을 설정하면 요청 헤더 `x-workroom-webhook-secret` 값이 일치할 때만 문자 발송이 진행됩니다.

## 4) Database Webhook 연결 (대시보드)
Supabase 대시보드 → **Database → Webhooks → Create a new hook**
- Table: `reservations`
- Events: **Insert**, **Update** 체크
- Type: **Supabase Edge Functions** → `reservation-sms` 선택
  (또는 HTTP Request, POST, URL = `https://<프로젝트ref>.functions.supabase.co/reservation-sms`)
- Headers:
  - `x-workroom-webhook-secret`: 위에서 설정한 `WEBHOOK_SECRET` 값

## 5) 테스트
- 관리자에서 예약을 **확정**으로 바꾸면 예약자 번호로 문자가 가야 합니다.
- 안 오면 함수 **Logs**(대시보드 → Edge Functions → reservation-sms → Logs)에서
  `secrets missing` 인지 `solapi error` 인지 확인하세요.

## 알림톡으로 확장
나중에 카카오 알림톡으로 바꾸려면, 카카오 비즈니스 채널 + 알림톡 템플릿(심사)을
Solapi에 등록한 뒤, `sendSms` 의 Solapi 호출을 `kakaoOptions`(pfId/templateId)를 포함한
알림톡 발송으로 바꾸면 됩니다(같은 `/messages/v4/send` 엔드포인트).

## 이용 종료 20분 전 문자

- 대상: 확정 상태이며 실제 입실 기록이 있고 아직 퇴실하지 않은 시간제·종일권
- 제외: 주간권·월권, 취소·완료·노쇼, 미입실 예약
- 중복 방지: DB에서 대상 예약을 먼저 1회 선점한 뒤 문자 발송
- 실행 주기: Netlify Scheduled Function이 5분마다 `reservation-end-reminder`를 호출

함수 배포:

```bash
supabase functions deploy reservation-end-reminder --no-verify-jwt
```

Netlify 환경 변수에는 프론트와 동일한 `VITE_SUPABASE_URL`이 있어야 합니다. 문자 발송 결과는
관리자 예약 상세의 문자 발송 이력에 `reservation_end_reminder` 이벤트로 기록됩니다.

---

# 결제 운영 — 포트원 카드 결제 / 현장 결제

운영 흐름:
- 사용자가 예약 신청
- 관리자가 예약을 확인하고 확정
- 온라인 결제 선택 시 고객이 회원 `예약현황`에서 카드로 결제
- 현장 결제(카드·현금)를 원하면 방문 전 운영자에게 별도 문의
- 관리자가 예약 상세에서 `결제 방식`, `결제 상태`를 직접 변경

포트원 환경 변수가 모두 등록되어 있고 예약 상태가 `확정`, 결제 상태가 `미결제`일 때 회원 화면에 `카드 결제하기` 버튼이 표시됩니다.

## 취소·환불

회원은 예약 시작 시간 전까지 예약을 취소할 수 있습니다.
포트원으로 결제된 예약은 관리자 예약 상세의 `PG 환불 실행`에서 카드 승인 취소를 처리합니다.
회원이 결제된 예약을 직접 취소한 경우에는 운영자가 환불 대기 상태를 확인한 뒤 PG 환불을 실행합니다.
일반 결제는 이용 시작 전 취소 시 전액 환불하며, 이용 시작 뒤에는 취소·환불이 어렵습니다.
월권 정기결제는 다음 결제일 전에 해지할 수 있고, 이용 중 환불은 이용일수를 일할 계산해 차감한 잔액을 환불합니다.

## 포트원 결제 (portone-payment)

회원이 확정된 예약을 사이트에서 카드로 바로 결제합니다. 결제 검증·환불·웹훅을 한 함수가 처리합니다.

1. 포트원 콘솔에서 V2 API Secret 발급 후 시크릿 등록:

```bash
supabase secrets set PORTONE_API_SECRET=<V2 API Secret>
supabase functions deploy portone-payment --no-verify-jwt
```

2. Netlify 환경 변수에 `VITE_PORTONE_STORE_ID`, `VITE_PORTONE_CHANNEL_KEY` 추가 (포트원 콘솔 > 결제 연동 정보). 두 값이 없으면 결제 버튼은 표시되지 않습니다.

3. (권장) 포트원 콘솔 > 웹훅에 함수 URL 등록 — 브라우저가 닫혀도 결제가 반영됩니다:
   `https://<프로젝트>.supabase.co/functions/v1/portone-payment`

검증 원칙: 함수는 클라이언트 값을 믿지 않고 포트원 API로 결제를 다시 조회해
금액이 예약(price_at_booking)과 일치할 때만 결제완료로 반영합니다.
환불은 관리자 JWT 검증 후 카드 승인 취소를 실행하고 payment_status를 refunded로 바꿉니다.
모든 시도는 reservation_payment_logs(provider='portone')에 기록됩니다.

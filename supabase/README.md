# Supabase 스키마 / 마이그레이션

## 유일한 기준은 `migrations/`

- **`migrations/`** — 변경 이력을 시간순으로 남기는 **버전드 마이그레이션**.
  스키마의 단 하나뿐인 정본(source of truth)입니다. `0001_baseline.sql`부터
  번호순으로 전부 실행하면 현재 운영 스키마가 그대로 만들어집니다.
- **`schema.sql` / `operational-hardening.sql`** — ⚠️ **더 이상 쓰지 않는 과거
  스냅샷입니다.** 초기 스키마 시점(대략 0005)에서 멈춰 있어 명함첩(`member_cards`),
  메모판, 정기결제(`subscriptions`), 출근부·지오 체크인 등이 통째로 빠져 있습니다.
  신규 셋업에 쓰면 **반쪽짜리 DB**가 만들어지고, 운영 DB에 재실행하면 이후
  마이그레이션에서 좁혀 둔 권한·정책이 과거 상태로 되돌아갑니다. 실행하지 마세요.

## 앞으로 스키마를 바꿀 때

1. `migrations/` 에 다음 번호의 파일을 추가합니다. 예: `0036_xxx.sql`
   - 그 파일에는 **이번 변경분만** (새 테이블/컬럼/정책/트리거) 넣습니다.
   - 멱등하게 작성하세요(`add column if not exists`, `create or replace`,
     `drop ... if exists` 등).
2. 운영 DB 적용:
   - Supabase 대시보드 SQL 에디터에서 **새 마이그레이션 파일만** 순서대로 실행, 또는
   - Supabase CLI 연결 시 `supabase db push`.

> 예전에는 "같은 변경을 `schema.sql`에도 반영" 하는 규칙이었지만, 실제로는
> 동기화가 끊긴 채 방치되어 오히려 위험한 파일이 됐습니다. 스냅샷을 손으로
> 유지하는 대신 마이그레이션만 관리합니다.

## 적용 순서 (대시보드 수동 적용 기준)

- 신규 DB: `migrations/0001_baseline.sql` 부터 **번호 순서대로 전부** 실행.
- 기존 DB 업데이트: 아직 적용하지 않은 `migrations/*.sql` 을 번호 순서대로 실행.

---

# 자동 배포 (GitHub Actions)

## 엣지 함수 — 자동

`main`에 `supabase/functions/**` 변경이 올라가면
[`.github/workflows/supabase-functions.yml`](../.github/workflows/supabase-functions.yml)이
모든 함수를 다시 배포합니다. 로컬 터미널에서 `supabase functions deploy`를 칠 일이 없어집니다.

함수마다 인증 게이트가 다르고 그 목록이 워크플로 안에 적혀 있습니다.
새 함수를 추가하면 `NO_JWT` / `WITH_JWT` 중 맞는 쪽에 이름을 넣어야 합니다.
(빠뜨리면 그 함수만 영영 배포되지 않습니다.)

- `NO_JWT` — 자체적으로 서명·비밀키·토큰을 검사하는 함수. 웹훅·크론이 여기 속합니다.
- `WITH_JWT` — 호출자의 액세스 토큰으로 본인을 식별하는 함수(회원 탈퇴 등).

### 준비 (한 번만)

저장소 **Settings > Secrets and variables > Actions**에 등록:

| 시크릿 | 값 |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens 에서 발급 |
| `SUPABASE_PROJECT_REF` | 대시보드 URL의 `project/<ref>` 부분 |

## 마이그레이션 — 수동 실행만

[`.github/workflows/supabase-migrations.yml`](../.github/workflows/supabase-migrations.yml)은
Actions 탭에서 직접 실행할 때만 동작합니다. 자동으로 돌지 않습니다.

⚠️ **처음 쓰기 전에**: 지금까지 SQL을 대시보드 편집기에 붙여넣어 실행해 왔다면
Supabase의 이력 테이블(`supabase_migrations.schema_migrations`)에 아무 기록도 없습니다.
그 상태에서 `db push`를 돌리면 CLI가 `0001_baseline`부터 전부 다시 실행합니다.

먼저 이미 적용한 버전을 이력에 등록하세요:

```bash
supabase link --project-ref <ref>
supabase migration list                      # 현재 CLI가 보는 상태
supabase migration repair --status applied 0001 0002 ... 0043
supabase migration list                      # 전부 applied 인지 확인
```

그 뒤부터는 Actions 탭에서 `action: status`로 현황을 보고,
새 마이그레이션만 `action: push` + `confirm: apply`로 적용합니다.
`SUPABASE_DB_PASSWORD` 시크릿(Settings > Database)이 추가로 필요합니다.

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
supabase secrets set CRON_SECRET=충분히_긴_랜덤문자열
supabase functions deploy reservation-end-reminder --no-verify-jwt
```

> `--no-verify-jwt`라 Supabase 인증이 붙지 않으므로 `CRON_SECRET`을 **반드시** 설정해야
> 합니다. 미설정 시 함수는 모든 호출을 401로 거절합니다(fail closed). 문자 발송은 비용이
> 발생하는 동작이라 열어둔 채 배포하지 않습니다.

Netlify 환경 변수에는 프론트와 동일한 `VITE_SUPABASE_URL`, 그리고 위와 **같은 값의**
`CRON_SECRET`이 있어야 합니다. 스케줄러가 `x-cron-secret` 헤더로 실어 보냅니다.
문자 발송 결과는 관리자 예약 상세의 문자 발송 이력에 `reservation_end_reminder`
이벤트로 기록됩니다.

---

# 결제 운영 — 포트원 카드 결제 / 현장 결제

운영 흐름:
- 사용자가 예약 신청
- 온라인 결제 선택 시 예약 완료 화면 또는 회원 `예약현황`에서 카드로 결제
- 결제가 완료되면 예약이 자동 확정되고 확정 문자가 발송
- 현장 결제·서비스·예외 예약은 관리자가 확인하고 확정
- 관리자가 예약 상세에서 `결제 방식`, `결제 상태`를 직접 변경

포트원 환경 변수가 모두 등록되어 있고 예약 상태가 `대기` 또는 `확정`, 결제 상태가 `미결제`인 온라인 예약에 `카드 결제하기` 버튼이 표시됩니다.

## 취소·환불

회원은 예약 시작 시간 전까지 예약을 취소할 수 있습니다.
회원이 결제된 예약을 직접 취소하면 `refund-reservation` 함수가 포트원 카드 승인
취소까지 즉시 실행하고 `payment_status`를 `refunded`로 바꿉니다. 환불이 실패하면
예약을 취소하지 않고 오류를 돌려주므로, 돈만 남고 예약이 사라지는 상태가 생기지
않습니다. 월권 정기결제가 걸린 예약이면 연결된 구독도 함께 해지합니다.
운영자는 관리자 예약 상세의 `PG 환불 실행`(portone-payment)으로 직접 환불할 수 있습니다.
일반 결제는 이용 시작 전 취소 시 전액 환불하며, 이용 시작 뒤에는 취소·환불이 어렵습니다.

```bash
supabase functions deploy refund-reservation   # Verify JWT ON (회원 토큰으로 본인 확인)
```
월권 정기결제는 다음 결제일 전에 해지할 수 있고, 이용 중 환불은 이용일수를 일할 계산해 차감한 잔액을 환불합니다.

## 포트원 결제 (portone-payment)

회원이 신청한 예약을 사이트에서 카드로 바로 결제합니다. 결제 검증·예약 자동확정·환불·웹훅을 한 함수가 처리합니다.

1. 포트원 콘솔에서 V2 API Secret 발급 후 시크릿 등록:

```bash
supabase secrets set PORTONE_API_SECRET=<V2 API Secret>
supabase functions deploy portone-payment --no-verify-jwt
```

2. Netlify 환경 변수에 `VITE_PORTONE_STORE_ID`, `VITE_PORTONE_CHANNEL_KEY` 추가 (포트원 콘솔 > 결제 연동 정보). 두 값이 없으면 결제 버튼은 표시되지 않습니다.

3. (권장) 포트원 콘솔 > 웹훅에 함수 URL 등록 — 브라우저가 닫혀도 결제가 반영됩니다:
   `https://<프로젝트>.supabase.co/functions/v1/portone-payment`

   웹훅을 쓰려면 콘솔에 표시된 웹훅 시크릿(`whsec_`로 시작)을 함께 등록해야 합니다:

   ```bash
   supabase secrets set PORTONE_WEBHOOK_SECRET=whsec_...
   ```

   함수는 Standard Webhooks 규격으로 서명(`webhook-id`/`webhook-timestamp`/`webhook-signature`)을
   검증하고, 5분을 넘긴 타임스탬프는 재전송으로 보고 거절합니다. 시크릿이 없으면 웹훅은
   전부 401로 거절됩니다(fail closed) — 이 경우에도 사용자 브라우저의 confirm 경로로
   결제는 반영되므로 결제가 유실되지는 않습니다.

검증 원칙: 함수는 클라이언트 값을 믿지 않고 포트원 API로 결제를 다시 조회해
금액이 예약(price_at_booking)과 일치할 때만 결제완료로 반영합니다.
환불은 관리자 JWT 검증 후 카드 승인 취소를 실행하고 payment_status를 refunded로 바꿉니다.
모든 시도는 reservation_payment_logs(provider='portone')에 기록됩니다.

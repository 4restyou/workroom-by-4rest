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

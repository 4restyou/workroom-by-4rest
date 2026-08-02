-- 정기결제 빌링키(카드 결제 토큰) 노출 차단.
-- 0032에서 subscriptions에 테이블 단위 select 권한을 주는 바람에, 본인 구독이면
-- PostgREST로 billing_key까지 읽을 수 있었다. 빌링키는 서버(엣지 함수, service_role)
-- 에서만 다뤄야 하므로 컬럼 단위 권한으로 좁힌다. RLS 정책(본인/관리자)은 그대로 유지.

revoke select on public.subscriptions from authenticated;

grant select (
  id,
  profile_id,
  reservation_id,
  method_label,
  pass_id,
  pass_name,
  amount,
  cycle_days,
  status,
  next_charge_at,
  last_paid_at,
  fail_count,
  created_at,
  canceled_at
) on public.subscriptions to authenticated;

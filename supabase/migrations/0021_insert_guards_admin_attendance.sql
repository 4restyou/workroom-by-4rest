-- 보안 보강 2건.
-- 1) 예약 결제 워크플로 필드 가드를 INSERT까지 확장:
--    기존 트리거(0014)는 BEFORE UPDATE 전용이라, 회원이 예약 "생성" 시
--    payment_link_send_count / payment_due_at / payment_link_sent_at /
--    payment_status 를 직접 API 호출로 심을 수 있는 틈이 있었다.
--    (payment_preference 는 회원이 예약 시 정당하게 선택하는 값이라 유지)
-- 2) 관리자 수기 출석 등록: QR을 찍기 어려운 회원을 관리자가 직접
--    출석 처리할 수 있도록 admin INSERT 정책 추가.

-- 1) 결제 필드 가드: INSERT + UPDATE 모두 커버
create or replace function public.guard_reservation_payment_workflow_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.payment_link_sent_at := null;
      new.payment_due_at := null;
      new.payment_link_send_count := 0;
      new.payment_status := 'unpaid';
    else
      new.payment_preference := old.payment_preference;
      new.payment_link_sent_at := old.payment_link_sent_at;
      new.payment_due_at := old.payment_due_at;
      new.payment_link_send_count := old.payment_link_send_count;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ab_guard_reservation_payment_workflow_fields on public.reservations;
create trigger ab_guard_reservation_payment_workflow_fields
before insert or update on public.reservations
for each row execute function public.guard_reservation_payment_workflow_fields();

-- 2) 관리자 수기 출석 등록 허용
drop policy if exists "attendance_admin_insert" on public.attendance;
create policy "attendance_admin_insert" on public.attendance
  for insert to authenticated
  with check (public.is_admin());

grant insert on public.attendance to authenticated;

-- 시간권 → 종일권 전환.
--
-- 시간권으로 들어온 손님이 하루 종일 머물기로 바꾸는 일이 잦다. '추가 1시간'을
-- 반복해 사면 종일권보다 비싸지므로, 이미 낸 돈을 빼고 차액만 받아 종일권으로
-- 바꿔 준다(이미 종일권 값을 넘겼으면 더 받지 않는다).
--
-- 전환하면 그날의 시간권·연장 예약은 종일권 하나로 합쳐진다. 그런데 그것들을
-- 그냥 두면 같은 사람이 같은 시간에 두 번 앉은 것으로 계산돼 정원이 잘못 찬다.
-- 그렇다고 삭제하면 이미 받은 돈이 매출에서 사라진다.
--
-- 그래서 '어느 예약으로 합쳐졌는지'를 남긴다. 합쳐진 예약은 취소 상태가 되지만
-- 결제 기록이 그대로 남아 매출은 유지되고, 문자 웹훅은 이 표시를 보고 취소
-- 안내를 보내지 않는다(손님은 취소된 게 아니라 종일권으로 바뀐 것이다).

alter table public.reservations
  add column if not exists upgraded_into uuid references public.reservations(id) on delete set null;

comment on column public.reservations.upgraded_into is
  '종일권 전환으로 이 예약이 합쳐진 대상 예약. 값이 있으면 취소가 아니라 전환이다.';

create index if not exists reservations_upgraded_into_idx
  on public.reservations (upgraded_into)
  where upgraded_into is not null;

-- 회원이 스스로 이 값을 조작해 정원 검사를 피하지 못하게 한다(0018의 잠금과 같은 방식).
create or replace function public.guard_reservation_access_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    new.access_start_date := old.access_start_date;
    new.access_end_date := old.access_end_date;
    new.access_weekdays := old.access_weekdays;
    new.access_paused_from := old.access_paused_from;
    new.access_paused_until := old.access_paused_until;
    new.end_reminder_attempted_at := old.end_reminder_attempted_at;
    new.end_reminder_sent_at := old.end_reminder_sent_at;
    new.expiry_reminder_attempted_at := old.expiry_reminder_attempted_at;
    new.expiry_reminder_sent_at := old.expiry_reminder_sent_at;
    new.upgraded_into := old.upgraded_into;
  end if;
  return new;
end;
$$;

-- 합쳐진(취소된) 예약은 좌석을 차지하지 않는다. 정원 계산에서 빼려면 0019의
-- 검사에서 status로 이미 걸러지므로(pending/confirmed만 셈) 추가 작업은 없다.

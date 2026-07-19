-- Administrators may register phone and walk-in reservations.

drop policy if exists "reservations_admin_insert" on public.reservations;
create policy "reservations_admin_insert"
on public.reservations
for insert
to authenticated
with check (public.is_admin());

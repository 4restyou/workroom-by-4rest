-- 0003: store the Toss payment key on a reservation (for receipts / refunds).
alter table reservations add column if not exists payment_key text;

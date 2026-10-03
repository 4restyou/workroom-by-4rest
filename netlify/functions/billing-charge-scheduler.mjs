// 하루 한 번(KST 오전 9시 10분) Supabase의 portone-billing 함수를 깨워
// 결제일이 된 월권 자동결제를 청구한다. 예전에는 이 스케줄이 아무 데도 없어서
// 자동결제 회원이 생기면 결제일이 지나도 청구되지 않았을 것이다.
// 같은 날 두 번 돌아도 결제 ID가 회차마다 고정이라 PortOne이 중복 청구를 거부한다.
// CRON_SECRET은 다른 스케줄러와 같은 값이다.
export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return new Response("SUPABASE_URL is not configured", { status: 500 });

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response("CRON_SECRET is not configured", { status: 500 });

  const response = await fetch(`${supabaseUrl}/functions/v1/portone-billing`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
    body: JSON.stringify({ type: "charge" }),
  });
  return new Response(await response.text(), { status: response.status });
};

export const config = {
  schedule: "10 0 * * *",
};

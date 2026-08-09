// 하루 한 번(KST 오전 10시) Supabase의 pass-expiry-reminder 함수를 깨운다.
// 그 함수는 `--no-verify-jwt`로 배포돼 있어 Supabase 인증이 붙지 않으므로,
// CRON_SECRET을 헤더로 실어 보내야 한다. end-reminder-scheduler와 같은 값이다.
export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return new Response("SUPABASE_URL is not configured", { status: 500 });

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response("CRON_SECRET is not configured", { status: 500 });

  const response = await fetch(`${supabaseUrl}/functions/v1/pass-expiry-reminder`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
    body: "{}",
  });
  return new Response(await response.text(), { status: response.status });
};

export const config = {
  // 01:00 UTC = 10:00 KST. 이른 아침이나 한밤중에 문자가 가지 않게 한다.
  schedule: "0 1 * * *",
};

// 5분마다 Supabase의 reservation-end-reminder 함수를 깨운다.
// 그 함수는 `--no-verify-jwt`로 배포돼 있어 Supabase 인증이 붙지 않으므로,
// CRON_SECRET을 헤더로 실어 보내야 한다. Netlify 환경 변수와 Supabase 시크릿에
// 같은 값을 등록해 둘 것.
export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return new Response("SUPABASE_URL is not configured", { status: 500 });

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return new Response("CRON_SECRET is not configured", { status: 500 });

  const response = await fetch(`${supabaseUrl}/functions/v1/reservation-end-reminder`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
    body: "{}",
  });
  return new Response(await response.text(), { status: response.status });
};

export const config = {
  schedule: "*/5 * * * *",
};

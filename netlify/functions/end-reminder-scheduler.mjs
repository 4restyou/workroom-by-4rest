export default async () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return new Response("SUPABASE_URL is not configured", { status: 500 });

  const response = await fetch(`${supabaseUrl}/functions/v1/reservation-end-reminder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return new Response(await response.text(), { status: response.status });
};

export const config = {
  schedule: "*/5 * * * *",
};

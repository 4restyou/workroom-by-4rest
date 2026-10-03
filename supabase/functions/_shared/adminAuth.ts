// 엣지 함수에서 "이 호출자가 관리자인가"를 판단하는 단 하나의 방법.
//
// 예전에는 함수마다 profiles.role을 서비스 키로 직접 읽었다. 그러면 DB의
// is_admin()이 2단계 인증(aal2)을 요구해도 엣지 함수만은 비밀번호 하나로
// 통과해 버린다. 호출자의 토큰으로 is_admin()을 그대로 불러 같은 규칙을 쓴다.
export async function callerIsAdmin(supabaseUrl: string, anonKey: string, authHeader: string): Promise<boolean> {
  if (!authHeader.startsWith("Bearer ")) return false;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/is_admin`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: authHeader, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) return false;
  return (await response.json().catch(() => false)) === true;
}

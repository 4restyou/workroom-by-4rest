import { supabase } from "./supabase";
import type { Profile } from "./types";

export function getGoogleRedirectUrl(path = "/account") {
  return `${window.location.origin}${path}`;
}

export async function signInWithGoogle(path = "/account") {
  if (!supabase) {
    throw new Error("서비스 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요.");
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getGoogleRedirectUrl(path),
    },
  });

  if (error) throw error;
}

export async function getCurrentProfile() {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;

  return data as Profile | null;
}

export async function ensureCurrentProfile() {
  if (!supabase) return null;
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return null;

  const existingProfile = await getCurrentProfile();
  if (existingProfile) return existingProfile;

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email ?? "",
      full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as Profile;
}

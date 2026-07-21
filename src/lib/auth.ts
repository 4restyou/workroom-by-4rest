export const MIN_PASSWORD_LENGTH = 8;

type AuthErrorLike = {
  code?: string;
  message?: string;
};

export function authErrorMessage(error: unknown, fallback = "인증 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.") {
  if (!error || typeof error !== "object") return fallback;

  const { code = "", message = "" } = error as AuthErrorLike;
  const normalizedMessage = message.toLowerCase();

  if (code === "invalid_credentials" || normalizedMessage.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호를 확인해 주세요.";
  }
  if (code === "email_not_confirmed" || normalizedMessage.includes("email not confirmed")) {
    return "이메일 인증을 완료한 뒤 로그인해 주세요.";
  }
  if (code === "user_already_exists" || code === "email_exists" || normalizedMessage.includes("already registered")) {
    return "이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해 주세요.";
  }
  if (code === "weak_password" || normalizedMessage.includes("password should be")) {
    return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상으로 입력해 주세요.`;
  }
  if (code === "same_password" || normalizedMessage.includes("same password")) {
    return "기존 비밀번호와 다른 비밀번호를 입력해 주세요.";
  }
  if (code === "over_email_send_rate_limit" || normalizedMessage.includes("rate limit")) {
    return "인증 메일 요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (normalizedMessage.includes("network") || normalizedMessage.includes("fetch")) {
    return "네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
  }

  return fallback;
}

export function passwordValidationMessage(password: string, confirmation?: string) {
  if (password.length < MIN_PASSWORD_LENGTH) return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상으로 입력해 주세요.`;
  if (confirmation !== undefined && password !== confirmation) return "비밀번호가 서로 일치하지 않습니다.";
  return "";
}


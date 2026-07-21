import { describe, expect, it } from "vitest";
import { authErrorMessage, passwordValidationMessage } from "./auth";

describe("authErrorMessage", () => {
  it("translates common Supabase authentication errors", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toContain("이메일 또는 비밀번호");
    expect(authErrorMessage({ code: "email_not_confirmed" })).toContain("이메일 인증");
    expect(authErrorMessage({ code: "over_email_send_rate_limit" })).toContain("잠시 후");
  });

  it("does not expose an unknown server error", () => {
    expect(authErrorMessage({ message: "internal detail" }, "다시 시도해 주세요.")).toBe("다시 시도해 주세요.");
  });
});

describe("passwordValidationMessage", () => {
  it("requires at least eight characters", () => {
    expect(passwordValidationMessage("1234567")).toContain("8자 이상");
  });

  it("checks password confirmation", () => {
    expect(passwordValidationMessage("12345678", "87654321")).toContain("일치하지 않습니다");
    expect(passwordValidationMessage("12345678", "12345678")).toBe("");
  });
});


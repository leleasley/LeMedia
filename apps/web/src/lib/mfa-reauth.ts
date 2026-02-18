import { verifySync } from "otplib";

export function normalizeMfaCode(input: string): string {
  return String(input || "").replace(/\s+/g, "").trim();
}

export function verifyMfaCode(secret: string | null | undefined, codeInput: string): { ok: boolean; message?: string } {
  if (!secret) {
    return { ok: false, message: "MFA is required for this action. Enable MFA first." };
  }

  const code = normalizeMfaCode(codeInput);
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, message: "Enter a valid 6-digit MFA code" };
  }

  try {
    const result = verifySync({ token: code, secret });
    if (!result.valid) {
      return { ok: false, message: "Invalid MFA code" };
    }
  } catch {
    return { ok: false, message: "Your MFA secret is invalid or outdated. Reset MFA and set it up again." };
  }

  return { ok: true };
}

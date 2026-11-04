export interface StrengthCheck {
  valid: boolean;
  reason?: string;
  checks: { label: string; ok: boolean }[];
}

export function checkPasswordStrength(pw: string): StrengthCheck {
  const checks = [
    { label: 'At least 8 characters', ok: pw.length >= 8 },
    { label: 'One capital letter', ok: /[A-Z]/.test(pw) },
    { label: 'One special character (!@#$…)', ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  const valid = checks.every((c) => c.ok);
  let reason: string | undefined;
  if (!valid) {
    if (pw.length < 8) reason = 'PASSWORD_TOO_SHORT';
    else reason = 'PASSWORD_WEAK';
  }
  return { valid, reason, checks };
}

export interface StrengthResult {
  valid: boolean;
  reason?: string;
}

const SPECIAL_RE = /[^A-Za-z0-9]/;

export function validatePasswordStrength(password: string): StrengthResult {
  if (typeof password !== 'string' || password.length < 8) {
    return { valid: false, reason: 'PASSWORD_TOO_SHORT' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'PASSWORD_WEAK' };
  }
  if (!SPECIAL_RE.test(password)) {
    return { valid: false, reason: 'PASSWORD_WEAK' };
  }
  return { valid: true };
}

export function passwordRequirementsText(): string {
  return '8+ characters, 1 capital, 1 special character';
}

export type PasswordPolicyCheck = {
  id: string;
  label: string;
  ok: boolean;
};

type PasswordPolicyRule = {
  id: string;
  label: string;
  error: string;
  test: (password: string, username?: string | null) => boolean;
};

const PASSWORD_RULES: PasswordPolicyRule[] = [
  {
    id: "length",
    label: "At least 8 characters",
    error: "Password must be at least 8 characters",
    test: (password) => password.length >= 8
  },
  {
    id: "uppercase",
    label: "Contains an uppercase letter",
    error: "Password must include an uppercase letter",
    test: (password) => /[A-Z]/.test(password)
  },
  {
    id: "special",
    label: "Contains a special character",
    error: "Password must include a special character",
    test: (password) => /[^A-Za-z0-9]/.test(password)
  },
  {
    id: "no-username",
    label: "Does not contain your username",
    error: "Password must not contain your username",
    test: (password, username) => {
      if (!username) return true;
      const cleaned = username.trim().toLowerCase();
      if (!cleaned || cleaned.length < 3) return true;
      return !password.toLowerCase().includes(cleaned);
    }
  }
];

export function getPasswordPolicyResult(input: { password: string; username?: string | null }) {
  const checks = PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    ok: rule.test(input.password, input.username)
  }));

  const errors = PASSWORD_RULES
    .map((rule, index) => ({ rule, ok: checks[index]?.ok }))
    .filter((entry) => !entry.ok)
    .map((entry) => entry.rule.error);

  return { checks, errors };
}

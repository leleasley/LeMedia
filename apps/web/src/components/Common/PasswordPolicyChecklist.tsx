"use client";

import { getPasswordPolicyResult } from "@/lib/password-policy";

type PasswordPolicyChecklistProps = {
  password: string;
  username?: string | null;
  showReuseNote?: boolean;
  className?: string;
};

export function PasswordPolicyChecklist({
  password,
  username,
  showReuseNote = false,
  className
}: PasswordPolicyChecklistProps) {
  const { checks } = getPasswordPolicyResult({ password, username });

  return (
    <div className={className}>
      <div className="text-xs font-semibold uppercase tracking-wide text-white/60 mb-2">
        Password Requirements
      </div>
      <div className="space-y-1">
        {checks.map((check) => (
          <div key={check.id} className="flex items-center gap-2 text-xs">
            <span className={`text-[0.65rem] font-bold ${check.ok ? "text-emerald-400" : "text-red-400"}`}>
              {check.ok ? "OK" : "X"}
            </span>
            <span className={check.ok ? "text-emerald-200" : "text-red-200"}>{check.label}</span>
          </div>
        ))}
        {showReuseNote ? (
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span className="text-[0.65rem] font-bold">i</span>
            <span>Password reuse is checked when you save</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

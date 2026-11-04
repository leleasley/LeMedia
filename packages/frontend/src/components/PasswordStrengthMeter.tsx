import { checkPasswordStrength } from '@/utils/passwordStrength';
import { Check, X } from 'lucide-react';

export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const { checks, valid } = checkPasswordStrength(password);
  const filled = checks.filter((c) => c.ok).length;
  const pct = (filled / checks.length) * 100;
  const color = valid ? 'bg-ndp-success' : filled === 0 ? 'bg-ndp-danger' : 'bg-amber-500';
  return (
    <div className="space-y-2">
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-1">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-1.5 text-xs ${c.ok ? 'text-ndp-success' : 'text-ndp-text-dim'}`}>
            {c.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

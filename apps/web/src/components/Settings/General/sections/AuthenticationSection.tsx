import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";

type AuthenticationSectionProps = {
  otpId: string;
  ssoId: string;
  mfaAdminId: string;
  mfaAllId: string;
  otpEnabled: boolean;
  ssoEnabled: boolean;
  enforceMfaAdmin: boolean;
  enforceMfaAll: boolean;
  settingsLoading: boolean;
  savingAuth: boolean;
  onOtpChange: (nextValue: boolean) => void;
  onSsoChange: (nextValue: boolean) => void;
  onEnforceMfaAdminChange: (nextValue: boolean) => void;
  onEnforceMfaAllChange: (nextValue: boolean) => void;
};

export function AuthenticationSection({
  otpId,
  ssoId,
  mfaAdminId,
  mfaAllId,
  otpEnabled,
  ssoEnabled,
  enforceMfaAdmin,
  enforceMfaAll,
  settingsLoading,
  savingAuth,
  onOtpChange,
  onSsoChange,
  onEnforceMfaAdminChange,
  onEnforceMfaAllChange,
}: AuthenticationSectionProps) {
  return (
    <section className="rounded-md border border-white/10 bg-slate-900/60 p-4 space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Auth</p>
        <h3 className="text-sm font-semibold text-white">Authentication Methods</h3>
        <p className="mt-1 text-xs text-muted">
          Control which authentication methods are available to users. Passkeys are always
          enabled if supported by the device.
        </p>
      </div>

      <div className="space-y-2">
        <AnimatedCheckbox
          id={otpId}
          label="Enable Authenticator App (OTP)"
          checked={otpEnabled}
          onChange={(e) => onOtpChange(e.target.checked)}
          disabled={settingsLoading || savingAuth}
        />
        <AnimatedCheckbox
          id={ssoId}
          label="Enable SSO Login"
          checked={ssoEnabled}
          onChange={(e) => onSsoChange(e.target.checked)}
          disabled={settingsLoading || savingAuth}
        />
        <AnimatedCheckbox
          id={mfaAdminId}
          label="Enforce MFA for Admins"
          description="Require administrators to configure MFA before accessing the dashboard."
          checked={enforceMfaAdmin}
          onChange={(e) => onEnforceMfaAdminChange(e.target.checked)}
          disabled={settingsLoading || savingAuth}
        />
        <AnimatedCheckbox
          id={mfaAllId}
          label="Enforce MFA for All Users"
          description="Require all users to configure MFA before accessing the app."
          checked={enforceMfaAll}
          onChange={(e) => onEnforceMfaAllChange(e.target.checked)}
          disabled={settingsLoading || savingAuth}
        />
      </div>
    </section>
  );
}

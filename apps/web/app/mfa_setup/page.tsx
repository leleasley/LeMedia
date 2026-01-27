import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { FlashBanner } from "@/components/Layout/FlashBanner";

export const metadata = {
  title: "Setup Two-Factor Authentication - LeMedia",
};
import { getMfaSessionById, getUserById } from "@/db";
import { resolveTotpIssuer } from "@/lib/server-utils";
import { authenticator } from "otplib";
import { toDataURL } from "qrcode";
import { MfaSetupForm } from "@/components/auth/MfaSetupForm";

export default async function MfaSetupPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("lemedia_mfa_token")?.value;
  const csrfToken = cookieStore.get("lemedia_csrf")?.value;
  const flash = cookieStore.get("lemedia_flash")?.value;
  const flashError = cookieStore.get("lemedia_flash_error")?.value;

  if (!token) {
    redirect("/login");
  }

  const session = await getMfaSessionById(token);
  if (!session || session.type !== "setup" || !session.secret) {
    redirect("/login");
  }

  const user = await getUserById(session.user_id);
  if (!user) {
    redirect("/login");
  }

  const otpAuthUrl = authenticator.keyuri(user.username, resolveTotpIssuer(), session.secret);
  const qrCode = await toDataURL(otpAuthUrl);
  const formattedSecret = session.secret.toUpperCase().match(/.{1,4}/g)?.join(" ") ?? session.secret;

  return (
    <main className="flex min-h-screen items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4 z-50">
        <ModeToggle />
      </div>
      {flash ? (
        <FlashBanner message={flash === "logged-out" ? "You have been logged out" : flash} timeoutMs={4000} />
      ) : null}
      {flashError ? <FlashBanner message={flashError} timeoutMs={4000} /> : null}
      <div className="w-full max-w-3xl rounded-3xl glass-strong p-8 md:p-12 backdrop-blur-xl space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold">Set up multi-factor authentication</h1>
          <p className="text-sm opacity-80">
            Scan the QR code or copy the secret key into your authenticator app or hardware key to configure MFA for {user.username}.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-white/10 border border-white/20 p-6 flex flex-col items-center text-center">
            <Image
              src={qrCode}
              alt="Scan to configure authenticator"
              width={192}
              height={192}
              className="w-48 h-48"
            />
            <p className="mt-4 text-xs uppercase tracking-[0.3em] text-muted">Scan this code</p>
          </div>
          <div className="rounded-2xl bg-white/10 border border-white/20 p-6 space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-muted">Secret key</p>
            <p className="text-xl font-semibold tracking-[0.3em] font-mono break-words">{formattedSecret}</p>
            <p className="text-xs text-muted">
              Paste this key if you can&apos;t scan the QR code or you need to enroll a hardware security key manually.
            </p>
          </div>
        </div>

        <MfaSetupForm csrfToken={csrfToken} />

        <p className="text-xs text-center opacity-60">
          Once validated, you will be signed out and asked to sign in again using the new MFA configuration.
        </p>
      </div>
    </main>
  );
}

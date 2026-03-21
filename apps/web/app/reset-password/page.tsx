import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { getUser } from "@/auth";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = {
  title: "Reset Password - LeMedia",
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: { token?: string | string[] };
}) {
  try {
    await getUser();
    redirect("/");
  } catch {
    // Not logged in — show the form.
  }

  const rawToken = searchParams?.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  if (token) {
    redirect(`/api/v1/auth/reset-password/exchange?token=${encodeURIComponent(token)}`);
  }

  const cookieStore = await cookies();
  const csrfToken = cookieStore.get("lemedia_csrf")?.value;
  const hasToken = !!cookieStore.get("rp_token")?.value;

  return (
    <main className="flex min-h-screen items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4 z-50">
        <ModeToggle />
      </div>
      <div className="w-full max-w-md rounded-3xl glass-strong p-8 md:p-10 backdrop-blur-xl space-y-6">
        {hasToken ? (
          <>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold">Set a new password</h1>
              <p className="text-sm opacity-70 leading-relaxed">
                Choose a strong password. This link expires 15 minutes after it was sent and can only be used once.
              </p>
            </div>
            <ResetPasswordForm csrfToken={csrfToken} />
          </>
        ) : (
          <div className="text-center space-y-5">
            <h1 className="text-2xl font-bold">Link expired or already used</h1>
            <p className="text-sm opacity-70 leading-relaxed">
              This password reset link has already been used or has expired. Please request a new one.
            </p>
            <Link
              href="/forgot-password"
              className="inline-block text-sm text-gray-400 hover:text-white transition"
            >
              Request a new reset link
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

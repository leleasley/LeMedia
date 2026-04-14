import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { Suspense } from "react";
import { getUser } from "@/auth";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = {
  title: "Reset Password - LeMedia",
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  try {
    await getUser();
    redirect("/");
  } catch {
    // Not logged in — show the form.
  }

  const cookieStore = await cookies();
  const csrfToken = cookieStore.get("lemedia_csrf")?.value;

  return (
    <main className="flex min-h-screen items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4 z-50">
        <ModeToggle />
      </div>
      <div className="w-full max-w-md rounded-3xl glass-strong p-8 md:p-10 backdrop-blur-xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Set a new password</h1>
          <p className="text-sm opacity-70 leading-relaxed">
            Choose a strong password. This link expires 15 minutes after it was sent and can only be used once.
          </p>
        </div>
        {/* Suspense required because ResetPasswordForm uses useSearchParams */}
        <Suspense fallback={null}>
          <ResetPasswordForm csrfToken={csrfToken} />
        </Suspense>
      </div>
    </main>
  );
}

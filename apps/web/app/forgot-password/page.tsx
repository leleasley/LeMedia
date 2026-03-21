import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { getUser } from "@/auth";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = {
  title: "Forgot Password - LeMedia",
};

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
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
          <h1 className="text-2xl font-bold">Forgot your password?</h1>
          <p className="text-sm opacity-70 leading-relaxed">
            Enter your email address and we&apos;ll send you a reset link if it matches an account.
          </p>
        </div>
        <ForgotPasswordForm csrfToken={csrfToken} />
      </div>
    </main>
  );
}

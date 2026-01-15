import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { getMfaSessionById, getUserById } from "@/db";
import { MfaForm } from "@/components/auth/MfaForm";

export const metadata = {
  title: "Two-Factor Authentication - LeMedia",
};

export default async function MfaPage() {
  const cookieStore = await cookies();
  const csrfToken = cookieStore.get("lemedia_csrf")?.value;
  const token = cookieStore.get("lemedia_mfa_token")?.value;

  if (!token) {
    redirect("/login");
  }

  const session = await getMfaSessionById(token);
  if (!session || session.type !== "verify") {
    redirect("/login");
  }

  const user = await getUserById(session.user_id);
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-black/40 z-0" />

      <div className="absolute top-4 right-4 z-50">
        <ModeToggle />
      </div>

      <div className="w-full max-w-[420px] relative z-10 flex flex-col">
        {/* Card */}
        <div className="rounded-2xl glass-strong border border-white/10 p-8 md:p-10 shadow-2xl backdrop-blur-2xl">
          <div className="flex flex-col items-center text-center mb-10">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-6 ring-1 ring-white/20">
              <span className="text-2xl">🔐</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
              Two-Factor Auth
            </h1>
            <p className="text-sm text-gray-400 font-medium">
              Enter the code from your authenticator app for <span className="text-white">{user.username}</span>
            </p>
          </div>

          <MfaForm csrfToken={csrfToken} />

          <div className="mt-6 text-center text-xs text-gray-500">
            Lost access? Contact an administrator.
          </div>
        </div>
      </div>
    </main>
  );
}

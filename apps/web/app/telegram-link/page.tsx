import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import TelegramLinkForm from "./TelegramLinkForm";

export const metadata = {
  title: "Link Telegram – LeMedia"
};

export default async function TelegramLinkPage() {
  // Check authentication server-side — if not logged in, send through the
  // login-redirect route which sets the return cookie then goes to /login.
  try {
    await getUser();
  } catch {
    redirect("/api/telegram/login-redirect");
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-2xl shadow-xl p-8">
        {/* Telegram icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-[#229ED9] flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-9 h-9 fill-white">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white text-center mb-2">Link Telegram</h1>
        <p className="text-gray-400 text-center text-sm mb-8">
          Enter the code from the{" "}
          <span className="text-[#229ED9] font-medium">LeMedia Bot</span> to connect your account.
        </p>

        <TelegramLinkForm />

        <p className="text-gray-600 text-xs text-center mt-6">
          The code expires after 10 minutes. Send{" "}
          <span className="font-mono">/link</span> again to get a new one.
        </p>
      </div>
    </div>
  );
}

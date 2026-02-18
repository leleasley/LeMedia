import { Metadata } from "next";
import { FriendsPageClient } from "@/components/Social/Friends/FriendsPageClient";

export const metadata: Metadata = {
  title: "Friends - LeMedia",
  description: "Manage your friends, view requests, and discover new people.",
};

export default async function FriendsPage() {
  return (
    <>
      <section className="space-y-6">
        <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-blue-500/5 to-transparent p-6 md:p-8">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
          <div className="relative">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 ring-1 ring-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-300"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">Friends</h1>
                <p className="text-sm text-white/60 mt-1">Manage your friends, requests, and discover people with similar taste</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="max-w-7xl mx-auto mt-6">
        <FriendsPageClient />
      </div>
    </>
  );
}

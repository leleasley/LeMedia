import { Metadata } from "next";
import { SocialFeedClient } from "@/components/Social/Feed/SocialFeedClient";

export const metadata: Metadata = {
  title: "Social Feed - LeMedia",
  description: "See what your friends are watching, listing, and sharing.",
};

export default async function SocialPage() {
  return (
    <>
      <section className="space-y-6">
        <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-violet-500/5 to-transparent p-6 md:p-8">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
          <div className="relative">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-violet-500/20 ring-1 ring-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-300"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">Social</h1>
                <p className="text-sm text-white/60 mt-1">See what your friends are watching, listing, and sharing</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="max-w-3xl mx-auto mt-6">
        <SocialFeedClient />
      </div>
    </>
  );
}

import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { RecommendationsPageClientV2 } from "@/components/Recommendations/RecommendationsPageClientV2";
import { Sparkles } from "lucide-react";

export const metadata = {
  title: "Recommendations - LeMedia",
};

export default async function RecommendationsPage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30">
            <Sparkles className="h-6 w-6 text-blue-400" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Recommendations</h1>
        </div>
        <p className="text-gray-400 ml-11">Personalized picks based on your activity and ratings.</p>
      </div>

      <RecommendationsPageClientV2 />
    </div>
  );
}

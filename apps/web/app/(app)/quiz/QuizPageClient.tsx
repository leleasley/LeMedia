"use client";

import { useRouter } from "next/navigation";
import { RecommendationQuiz } from "@/components/Quiz";
import { Sparkles, RefreshCw } from "lucide-react";
import { useState } from "react";

interface QuizPageClientProps {
  alreadyCompleted: boolean;
}

export function QuizPageClient({ alreadyCompleted }: QuizPageClientProps) {
  const router = useRouter();
  const [showQuiz, setShowQuiz] = useState(!alreadyCompleted);

  const handleComplete = () => {
    router.push("/recommendations?quizComplete=true");
  };

  const handleSkip = () => {
    router.push("/recommendations");
  };

  const handleRetake = async () => {
    await fetch("/api/v1/quiz", { method: "DELETE", credentials: "include" });
    setShowQuiz(true);
  };

  if (alreadyCompleted && !showQuiz) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 mb-6">
            <Sparkles className="w-10 h-10 text-green-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">
            Your Taste Profile is Ready!
          </h1>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            We&apos;ve already personalized your recommendations based on your preferences.
            Your recommendations are now tailored to your taste.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => router.push("/recommendations")}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-medium transition-all"
            >
              View Recommendations
            </button>
            <button
              onClick={handleRetake}
              className="flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-medium transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Retake Quiz
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <RecommendationQuiz onComplete={handleComplete} onSkip={handleSkip} />
    </div>
  );
}

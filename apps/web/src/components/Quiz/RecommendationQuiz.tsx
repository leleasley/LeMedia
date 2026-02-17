"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Sparkles, Loader2 } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { QuizMultiSelect } from "./QuizMultiSelect";
import { QuizSingleSelect } from "./QuizSingleSelect";
import { QuizSlider } from "./QuizSlider";

interface QuizOption {
  id: string;
  label: string;
  icon?: string;
}

interface QuizQuestion {
  id: string;
  type: "multi-select" | "single-select" | "slider";
  question: string;
  options?: QuizOption[];
  labels?: [string, string];
  min?: number;
  max?: number;
}

interface RecommendationQuizProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

export function RecommendationQuiz({ onComplete, onSkip }: RecommendationQuizProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuiz();
  }, []);

  const fetchQuiz = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/quiz", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load quiz");
      const data = await res.json();
      setQuestions(data.questions || []);
      setCurrentStep(data.currentStep || 0);
      setAnswers(data.answers || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quiz");
    } finally {
      setLoading(false);
    }
  };

  const saveProgress = async (questionId: string, answer: string | string[] | number) => {
    try {
      await csrfFetch("/api/v1/quiz", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ questionId, answer }),
      });
    } catch {
      // Silently fail - we can retry later
    }
  };

  const handleAnswer = (answer: string | string[] | number) => {
    const question = questions[currentStep];
    if (!question) return;

    const newAnswers = { ...answers, [question.id]: answer };
    setAnswers(newAnswers);
    saveProgress(question.id, answer);
  };

  const handleNext = () => {
    if (currentStep < questions.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      const res = await csrfFetch("/api/v1/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ answers }),
      });

      if (!res.ok) throw new Error("Failed to submit quiz");
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit quiz");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[500px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-gray-400">Loading quiz...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[500px] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchQuiz}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentStep];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const isLastQuestion = currentStep === questions.length - 1;
  const progress = ((currentStep + 1) / questions.length) * 100;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-full mb-4">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-purple-300">Personalize Your Experience</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Tell us what you love
        </h2>
        <p className="text-gray-400">
          Answer a few questions to get personalized recommendations
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
          <span>Question {currentStep + 1} of {questions.length}</span>
          <span>{Math.round(progress)}% complete</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question */}
      {currentQuestion && (
        <div className="bg-gray-900/50 border border-white/10 rounded-2xl p-8 mb-8">
          <h3 className="text-xl font-semibold text-white mb-6 text-center">
            {currentQuestion.question}
          </h3>

          {currentQuestion.type === "multi-select" && currentQuestion.options && (
            <QuizMultiSelect
              options={currentQuestion.options}
              selected={(currentAnswer as string[]) || []}
              onChange={handleAnswer}
            />
          )}

          {currentQuestion.type === "single-select" && currentQuestion.options && (
            <QuizSingleSelect
              options={currentQuestion.options}
              selected={currentAnswer as string | undefined}
              onChange={handleAnswer}
            />
          )}

          {currentQuestion.type === "slider" && currentQuestion.labels && (
            <QuizSlider
              labels={currentQuestion.labels}
              min={currentQuestion.min || 1}
              max={currentQuestion.max || 5}
              value={(currentAnswer as number) || 3}
              onChange={handleAnswer}
            />
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrev}
          disabled={currentStep === 0}
          className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          Previous
        </button>

        <button
          onClick={onSkip}
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          Skip for now
        </button>

        {isLastQuestion ? (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-xl font-medium transition-all disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Complete
                <Sparkles className="w-5 h-5" />
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-medium transition-all"
          >
            Next
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}

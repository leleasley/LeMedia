import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { getUserByUsername, getUserTasteProfile, upsertUser } from "@/db";
import { QuizPageClient } from "./QuizPageClient";

export const metadata: Metadata = {
  title: "Personalize Your Recommendations - LeMedia",
  description: "Answer a few questions to get personalized movie and TV show recommendations",
};

export default async function QuizPage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const dbUser = await getUserByUsername(user.username);
  const userId = dbUser?.id ?? (await upsertUser(user.username, user.groups)).id;

  // Check if already completed
  const profile = await getUserTasteProfile(userId);

  return <QuizPageClient alreadyCompleted={profile?.quizCompleted ?? false} />;
}

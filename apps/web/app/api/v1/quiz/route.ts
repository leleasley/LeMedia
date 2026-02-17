import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import {
  deleteUserQuizState,
  getUserByUsername,
  getUserQuizState,
  getUserTasteProfile,
  upsertUser,
  upsertUserQuizState,
  upsertUserTasteProfile,
} from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";

// Quiz questions configuration
const QUIZ_QUESTIONS = [
  {
    id: "genres",
    type: "multi-select",
    question: "Which genres do you enjoy the most?",
    options: [
      { id: "action", label: "Action", icon: "💥" },
      { id: "comedy", label: "Comedy", icon: "😂" },
      { id: "drama", label: "Drama", icon: "🎭" },
      { id: "horror", label: "Horror", icon: "👻" },
      { id: "scifi", label: "Sci-Fi", icon: "🚀" },
      { id: "romance", label: "Romance", icon: "❤️" },
      { id: "thriller", label: "Thriller", icon: "😰" },
      { id: "fantasy", label: "Fantasy", icon: "🧙" },
      { id: "documentary", label: "Documentary", icon: "📹" },
      { id: "animation", label: "Animation", icon: "🎨" },
    ],
  },
  {
    id: "dislikes",
    type: "multi-select",
    question: "Are there any genres you'd prefer to avoid?",
    options: [
      { id: "horror", label: "Horror", icon: "👻" },
      { id: "romance", label: "Romance", icon: "❤️" },
      { id: "documentary", label: "Documentary", icon: "📹" },
      { id: "musical", label: "Musical", icon: "🎵" },
      { id: "war", label: "War", icon: "⚔️" },
      { id: "western", label: "Western", icon: "🤠" },
    ],
  },
  {
    id: "mood_preference",
    type: "slider",
    question: "What kind of mood do you usually prefer?",
    labels: ["Light & Fun", "Dark & Intense"],
    min: 1,
    max: 5,
  },
  {
    id: "pacing",
    type: "slider",
    question: "How do you feel about pacing?",
    labels: ["Slow & Thoughtful", "Fast & Action-packed"],
    min: 1,
    max: 5,
  },
  {
    id: "content_age",
    type: "single-select",
    question: "What era of content do you prefer?",
    options: [
      { id: "new", label: "Recent releases (last 5 years)", icon: "🆕" },
      { id: "modern", label: "Modern classics (2000s-2010s)", icon: "📺" },
      { id: "classic", label: "Classic cinema (pre-2000)", icon: "🎬" },
      { id: "any", label: "I enjoy all eras equally", icon: "🌟" },
    ],
  },
  {
    id: "runtime",
    type: "single-select",
    question: "What's your ideal runtime?",
    options: [
      { id: "short", label: "Under 90 minutes", icon: "⚡" },
      { id: "medium", label: "90-120 minutes", icon: "⏱️" },
      { id: "long", label: "Over 2 hours", icon: "🍿" },
      { id: "any", label: "Runtime doesn't matter", icon: "🎬" },
    ],
  },
  {
    id: "media_type",
    type: "slider",
    question: "Movies or TV shows?",
    labels: ["Movies", "TV Shows"],
    min: 1,
    max: 5,
  },
  {
    id: "foreign",
    type: "single-select",
    question: "How do you feel about foreign language content?",
    options: [
      { id: "love", label: "Love it! Show me everything", icon: "🌍" },
      { id: "open", label: "Open to it with subtitles", icon: "📖" },
      { id: "occasional", label: "Only occasionally", icon: "🤔" },
      { id: "prefer_english", label: "Prefer English content", icon: "🇬🇧" },
    ],
  },
  {
    id: "indie_mainstream",
    type: "slider",
    question: "Indie films or blockbusters?",
    labels: ["Indie/Art House", "Mainstream Blockbusters"],
    min: 1,
    max: 5,
  },
  {
    id: "rating_threshold",
    type: "single-select",
    question: "What's your minimum rating threshold?",
    options: [
      { id: "high", label: "8+ only (critically acclaimed)", icon: "🏆" },
      { id: "good", label: "7+ (generally good)", icon: "👍" },
      { id: "decent", label: "6+ (decent enough)", icon: "👌" },
      { id: "any", label: "I'll give anything a chance", icon: "🎲" },
    ],
  },
  {
    id: "theme_preference",
    type: "multi-select",
    question: "Which themes resonate with you?",
    options: [
      { id: "adventure", label: "Adventure & Exploration", icon: "🗺️" },
      { id: "relationships", label: "Relationships & Family", icon: "👨‍👩‍👧‍👦" },
      { id: "mystery", label: "Mystery & Crime", icon: "🔍" },
      { id: "supernatural", label: "Supernatural & Magic", icon: "✨" },
      { id: "historical", label: "Historical & Period", icon: "📜" },
      { id: "comedy_satire", label: "Comedy & Satire", icon: "🎭" },
    ],
  },
  {
    id: "watch_context",
    type: "single-select",
    question: "How do you usually watch?",
    options: [
      { id: "solo", label: "Solo viewing", icon: "🧘" },
      { id: "partner", label: "With a partner", icon: "💑" },
      { id: "family", label: "Family movie night", icon: "👨‍👩‍👧‍👦" },
      { id: "friends", label: "With friends", icon: "👥" },
      { id: "varies", label: "It varies", icon: "🔄" },
    ],
  },
];

const AnswerSchema = z.object({
  questionId: z.string(),
  answer: z.union([z.string(), z.array(z.string()), z.number()]),
});

const SubmitQuizSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.number()])),
});

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) {
    throw new Error("Unauthorized");
  }
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return dbUser.id;
  const created = await upsertUser(user.username, user.groups);
  return created.id;
}

// GET: Get current quiz state and questions
export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId();
    const [quizState, tasteProfile] = await Promise.all([
      getUserQuizState(userId),
      getUserTasteProfile(userId),
    ]);

    return jsonResponseWithETag(req, {
      questions: QUIZ_QUESTIONS,
      totalSteps: QUIZ_QUESTIONS.length,
      currentStep: quizState?.currentStep ?? 0,
      answers: quizState?.answers ?? {},
      completed: tasteProfile?.quizCompleted ?? false,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load quiz" }, { status: 500 });
  }
}

// PATCH: Save progress
export async function PATCH(req: NextRequest) {
  try {
    const userId = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = await req.json();
    const { questionId, answer } = AnswerSchema.parse(body);

    const currentState = await getUserQuizState(userId);
    const answers = { ...(currentState?.answers ?? {}), [questionId]: answer };
    const currentStep = QUIZ_QUESTIONS.findIndex((q) => q.id === questionId) + 1;

    await upsertUserQuizState(userId, {
      currentStep,
      totalSteps: QUIZ_QUESTIONS.length,
      answers,
    });

    return NextResponse.json({ ok: true, currentStep });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to save progress" }, { status: 500 });
  }
}

// POST: Submit completed quiz
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = await req.json();
    const { answers } = SubmitQuizSchema.parse(body);

    // Process answers into taste profile
    const profileUpdates: Record<string, any> = {
      quizCompleted: true,
      quizCompletedAt: new Date().toISOString(),
      quizVersion: 1,
    };

    // Map genres
    const likedGenres = answers.genres as string[] | undefined;
    const dislikedGenres = answers.dislikes as string[] | undefined;
    const genreMap: Record<string, string> = {
      action: "genreAction",
      comedy: "genreComedy",
      drama: "genreDrama",
      horror: "genreHorror",
      scifi: "genreScifi",
      romance: "genreRomance",
      thriller: "genreThriller",
      fantasy: "genreFantasy",
      documentary: "genreDocumentary",
      animation: "genreAnimation",
      adventure: "genreAdventure",
      crime: "genreCrime",
      family: "genreFamily",
      history: "genreHistory",
      music: "genreMusic",
      mystery: "genreMystery",
      war: "genreWar",
      western: "genreWestern",
    };

    // Set genre preferences (5 = love, 1 = avoid)
    if (likedGenres) {
      for (const genre of likedGenres) {
        if (genreMap[genre]) {
          profileUpdates[genreMap[genre]] = 5;
        }
      }
    }
    if (dislikedGenres) {
      for (const genre of dislikedGenres) {
        if (genreMap[genre]) {
          profileUpdates[genreMap[genre]] = 1;
        }
      }
    }

    // Mood preference
    if (typeof answers.mood_preference === "number") {
      profileUpdates.moodIntense = answers.mood_preference;
      profileUpdates.moodLighthearted = 6 - answers.mood_preference;
    }

    // Pacing -> exciting
    if (typeof answers.pacing === "number") {
      profileUpdates.moodExciting = answers.pacing;
      profileUpdates.moodThoughtful = 6 - answers.pacing;
    }

    // Content age
    const contentAge = answers.content_age as string | undefined;
    if (contentAge === "new") {
      profileUpdates.preferNewReleases = true;
      profileUpdates.preferClassics = false;
    } else if (contentAge === "classic") {
      profileUpdates.preferClassics = true;
      profileUpdates.preferNewReleases = false;
    }

    // Runtime
    const runtime = answers.runtime as string | undefined;
    if (runtime === "short") {
      profileUpdates.preferShort = true;
      profileUpdates.preferLong = false;
    } else if (runtime === "long") {
      profileUpdates.preferLong = true;
      profileUpdates.preferShort = false;
    }

    // Media type
    if (typeof answers.media_type === "number") {
      profileUpdates.preferMovies = 6 - answers.media_type;
      profileUpdates.preferTv = answers.media_type;
    }

    // Foreign content
    const foreign = answers.foreign as string | undefined;
    if (foreign === "love" || foreign === "open") {
      profileUpdates.preferForeign = true;
    } else if (foreign === "prefer_english") {
      profileUpdates.preferForeign = false;
    }

    // Indie vs mainstream
    if (typeof answers.indie_mainstream === "number") {
      profileUpdates.preferIndie = answers.indie_mainstream <= 2;
    }

    // Rating threshold
    const ratingThreshold = answers.rating_threshold as string | undefined;
    if (ratingThreshold === "high") {
      profileUpdates.minRating = 8;
    } else if (ratingThreshold === "good") {
      profileUpdates.minRating = 7;
    } else if (ratingThreshold === "decent") {
      profileUpdates.minRating = 6;
    }

    // Store extended preferences
    profileUpdates.extendedPreferences = {
      themes: answers.theme_preference,
      watchContext: answers.watch_context,
    };

    await upsertUserTasteProfile(userId, profileUpdates);
    await deleteUserQuizState(userId);

    return NextResponse.json({ ok: true, message: "Quiz completed!" });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("Quiz submission error:", err);
    return NextResponse.json({ error: "Unable to submit quiz" }, { status: 500 });
  }
}

// DELETE: Reset quiz
export async function DELETE(req: NextRequest) {
  try {
    const userId = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    await deleteUserQuizState(userId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to reset quiz" }, { status: 500 });
  }
}

import { getPool } from "./core";


// ==================== TASTE PROFILE & QUIZ ====================

export interface UserTasteProfile {
  id: number;
  userId: number;
  genreAction: number | null;
  genreAdventure: number | null;
  genreAnimation: number | null;
  genreComedy: number | null;
  genreCrime: number | null;
  genreDocumentary: number | null;
  genreDrama: number | null;
  genreFamily: number | null;
  genreFantasy: number | null;
  genreHistory: number | null;
  genreHorror: number | null;
  genreMusic: number | null;
  genreMystery: number | null;
  genreRomance: number | null;
  genreScifi: number | null;
  genreThriller: number | null;
  genreWar: number | null;
  genreWestern: number | null;
  preferNewReleases: boolean | null;
  preferClassics: boolean | null;
  preferForeign: boolean | null;
  preferIndie: boolean | null;
  minRating: number | null;
  moodIntense: number | null;
  moodLighthearted: number | null;
  moodThoughtful: number | null;
  moodExciting: number | null;
  preferMovies: number | null;
  preferTv: number | null;
  preferShort: boolean | null;
  preferLong: boolean | null;
  extendedPreferences: Record<string, any>;
  quizCompleted: boolean;
  quizCompletedAt: string | null;
  quizVersion: number;
  createdAt: string;
  updatedAt: string;
}


export async function getUserTasteProfile(userId: number): Promise<UserTasteProfile | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, user_id as "userId",
            genre_action as "genreAction", genre_adventure as "genreAdventure",
            genre_animation as "genreAnimation", genre_comedy as "genreComedy",
            genre_crime as "genreCrime", genre_documentary as "genreDocumentary",
            genre_drama as "genreDrama", genre_family as "genreFamily",
            genre_fantasy as "genreFantasy", genre_history as "genreHistory",
            genre_horror as "genreHorror", genre_music as "genreMusic",
            genre_mystery as "genreMystery", genre_romance as "genreRomance",
            genre_scifi as "genreScifi", genre_thriller as "genreThriller",
            genre_war as "genreWar", genre_western as "genreWestern",
            prefer_new_releases as "preferNewReleases", prefer_classics as "preferClassics",
            prefer_foreign as "preferForeign", prefer_indie as "preferIndie",
            min_rating as "minRating",
            mood_intense as "moodIntense", mood_lighthearted as "moodLighthearted",
            mood_thoughtful as "moodThoughtful", mood_exciting as "moodExciting",
            prefer_movies as "preferMovies", prefer_tv as "preferTv",
            prefer_short as "preferShort", prefer_long as "preferLong",
            extended_preferences as "extendedPreferences",
            quiz_completed as "quizCompleted", quiz_completed_at as "quizCompletedAt",
            quiz_version as "quizVersion",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM user_taste_profile WHERE user_id = $1`,
    [userId]
  );
  return res.rows[0] || null;
}


export async function upsertUserTasteProfile(
  userId: number,
  updates: Partial<Omit<UserTasteProfile, "id" | "userId" | "createdAt" | "updatedAt">>
): Promise<UserTasteProfile> {
  const p = getPool();

  // Build dynamic upsert
  const fields: string[] = ["user_id"];
  const values: any[] = [userId];
  const placeholders: string[] = ["$1"];
  const updateSets: string[] = [];
  let idx = 2;

  const fieldMap: Record<string, string> = {
    genreAction: "genre_action",
    genreAdventure: "genre_adventure",
    genreAnimation: "genre_animation",
    genreComedy: "genre_comedy",
    genreCrime: "genre_crime",
    genreDocumentary: "genre_documentary",
    genreDrama: "genre_drama",
    genreFamily: "genre_family",
    genreFantasy: "genre_fantasy",
    genreHistory: "genre_history",
    genreHorror: "genre_horror",
    genreMusic: "genre_music",
    genreMystery: "genre_mystery",
    genreRomance: "genre_romance",
    genreScifi: "genre_scifi",
    genreThriller: "genre_thriller",
    genreWar: "genre_war",
    genreWestern: "genre_western",
    preferNewReleases: "prefer_new_releases",
    preferClassics: "prefer_classics",
    preferForeign: "prefer_foreign",
    preferIndie: "prefer_indie",
    minRating: "min_rating",
    moodIntense: "mood_intense",
    moodLighthearted: "mood_lighthearted",
    moodThoughtful: "mood_thoughtful",
    moodExciting: "mood_exciting",
    preferMovies: "prefer_movies",
    preferTv: "prefer_tv",
    preferShort: "prefer_short",
    preferLong: "prefer_long",
    extendedPreferences: "extended_preferences",
    quizCompleted: "quiz_completed",
    quizCompletedAt: "quiz_completed_at",
    quizVersion: "quiz_version",
  };

  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (key in updates) {
      fields.push(dbField);
      placeholders.push(`$${idx}`);
      updateSets.push(`${dbField} = EXCLUDED.${dbField}`);
      values.push((updates as any)[key]);
      idx++;
    }
  }

  updateSets.push("updated_at = NOW()");

  const res = await p.query(
    `INSERT INTO user_taste_profile (${fields.join(", ")})
     VALUES (${placeholders.join(", ")})
     ON CONFLICT (user_id) DO UPDATE SET ${updateSets.join(", ")}
     RETURNING id, user_id as "userId",
            genre_action as "genreAction", genre_adventure as "genreAdventure",
            genre_animation as "genreAnimation", genre_comedy as "genreComedy",
            genre_crime as "genreCrime", genre_documentary as "genreDocumentary",
            genre_drama as "genreDrama", genre_family as "genreFamily",
            genre_fantasy as "genreFantasy", genre_history as "genreHistory",
            genre_horror as "genreHorror", genre_music as "genreMusic",
            genre_mystery as "genreMystery", genre_romance as "genreRomance",
            genre_scifi as "genreScifi", genre_thriller as "genreThriller",
            genre_war as "genreWar", genre_western as "genreWestern",
            prefer_new_releases as "preferNewReleases", prefer_classics as "preferClassics",
            prefer_foreign as "preferForeign", prefer_indie as "preferIndie",
            min_rating as "minRating",
            mood_intense as "moodIntense", mood_lighthearted as "moodLighthearted",
            mood_thoughtful as "moodThoughtful", mood_exciting as "moodExciting",
            prefer_movies as "preferMovies", prefer_tv as "preferTv",
            prefer_short as "preferShort", prefer_long as "preferLong",
            extended_preferences as "extendedPreferences",
            quiz_completed as "quizCompleted", quiz_completed_at as "quizCompletedAt",
            quiz_version as "quizVersion",
            created_at as "createdAt", updated_at as "updatedAt"`,
    values
  );
  return res.rows[0];
}


export interface UserQuizState {
  id: number;
  userId: number;
  currentStep: number;
  totalSteps: number;
  answers: Record<string, any>;
  startedAt: string;
  updatedAt: string;
}


export async function getUserQuizState(userId: number): Promise<UserQuizState | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, user_id as "userId", current_step as "currentStep",
            total_steps as "totalSteps", answers, started_at as "startedAt",
            updated_at as "updatedAt"
     FROM user_quiz_state WHERE user_id = $1`,
    [userId]
  );
  return res.rows[0] || null;
}


export async function upsertUserQuizState(
  userId: number,
  updates: { currentStep?: number; totalSteps?: number; answers?: Record<string, any> }

): Promise<UserQuizState> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO user_quiz_state (user_id, current_step, total_steps, answers)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       current_step = COALESCE($2, user_quiz_state.current_step),
       total_steps = COALESCE($3, user_quiz_state.total_steps),
       answers = COALESCE($4, user_quiz_state.answers),
       updated_at = NOW()
     RETURNING id, user_id as "userId", current_step as "currentStep",
               total_steps as "totalSteps", answers, started_at as "startedAt",
               updated_at as "updatedAt"`,
    [userId, updates.currentStep ?? 0, updates.totalSteps ?? 12, updates.answers ?? {}]
  );
  return res.rows[0];
}

export async function deleteUserQuizState(userId: number): Promise<void> {
  const p = getPool();
  await p.query(`DELETE FROM user_quiz_state WHERE user_id = $1`, [userId]);
}

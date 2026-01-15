import "server-only";
import { getActiveApprovalRules, getUserRequestStats } from "@/db";

export interface ApprovalContext {
  requestType: "movie" | "episode";
  tmdbId: number;
  userId: number;
  username: string;
  isAdmin: boolean;
  // Movie/TV metadata
  voteAverage?: number;
  popularity?: number;
  genres?: number[];
  contentRating?: string;
  releaseYear?: number;
}

/**
 * Evaluates approval rules and returns whether the request should be auto-approved
 */
export async function evaluateApprovalRules(context: ApprovalContext): Promise<{
  shouldApprove: boolean;
  matchedRule?: { id: number; name: string };
}> {
  // Admins bypass auto-approval (they approve instantly anyway)
  if (context.isAdmin) {
    return { shouldApprove: false };
  }

  const rules = await getActiveApprovalRules();
  if (!rules.length) {
    return { shouldApprove: false };
  }

  // Rules are ordered by priority (highest first)
  for (const rule of rules) {
    const matches = await evaluateRule(rule, context);
    if (matches) {
      return {
        shouldApprove: true,
        matchedRule: { id: rule.id, name: rule.name },
      };
    }
  }

  return { shouldApprove: false };
}

async function evaluateRule(
  rule: { id: number; name: string; ruleType: string; conditions: Record<string, any> },
  context: ApprovalContext
): Promise<boolean> {
  switch (rule.ruleType) {
    case "user_trust":
      return evaluateUserTrustRule(rule.conditions, context);
    case "popularity":
      return evaluatePopularityRule(rule.conditions, context);
    case "time_based":
      return evaluateTimeBasedRule(rule.conditions, context);
    case "genre":
      return evaluateGenreRule(rule.conditions, context);
    case "content_rating":
      return evaluateContentRatingRule(rule.conditions, context);
    default:
      return false;
  }
}

async function evaluateUserTrustRule(
  conditions: Record<string, any>,
  context: ApprovalContext
): Promise<boolean> {
  // Trust users after X approved requests
  const minApprovedRequests = Number(conditions.minApprovedRequests ?? 0);
  if (minApprovedRequests <= 0) return false;

  const stats = await getUserRequestStats(context.username);
  const approvedCount = stats.available;

  return approvedCount >= minApprovedRequests;
}

function evaluatePopularityRule(
  conditions: Record<string, any>,
  context: ApprovalContext
): boolean {
  // Auto-approve popular content
  const minVoteAverage = Number(conditions.minVoteAverage ?? 0);
  const minPopularity = Number(conditions.minPopularity ?? 0);

  if (minVoteAverage > 0 && (context.voteAverage ?? 0) < minVoteAverage) {
    return false;
  }

  if (minPopularity > 0 && (context.popularity ?? 0) < minPopularity) {
    return false;
  }

  return minVoteAverage > 0 || minPopularity > 0;
}

function evaluateTimeBasedRule(
  conditions: Record<string, any>,
  context: ApprovalContext
): boolean {
  // Auto-approve during certain hours (e.g., off-peak)
  const allowedHours = conditions.allowedHours as number[] | undefined;
  if (!allowedHours || !Array.isArray(allowedHours) || allowedHours.length === 0) {
    return false;
  }

  const currentHour = new Date().getHours();
  return allowedHours.includes(currentHour);
}

function evaluateGenreRule(
  conditions: Record<string, any>,
  context: ApprovalContext
): boolean {
  // Auto-approve specific genres
  const allowedGenres = conditions.allowedGenres as number[] | undefined;
  if (!allowedGenres || !Array.isArray(allowedGenres) || allowedGenres.length === 0) {
    return false;
  }

  if (!context.genres || !Array.isArray(context.genres) || context.genres.length === 0) {
    return false;
  }

  // Check if any of the content's genres are in the allowed list
  return context.genres.some((g) => allowedGenres.includes(g));
}

function evaluateContentRatingRule(
  conditions: Record<string, any>,
  context: ApprovalContext
): boolean {
  // Auto-approve based on content rating (e.g., only G, PG, PG-13)
  const allowedRatings = conditions.allowedRatings as string[] | undefined;
  if (!allowedRatings || !Array.isArray(allowedRatings) || allowedRatings.length === 0) {
    return false;
  }

  if (!context.contentRating) {
    return false;
  }

  return allowedRatings.includes(context.contentRating);
}

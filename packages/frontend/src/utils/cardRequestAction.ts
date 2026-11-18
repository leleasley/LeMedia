import { canRequest, MEDIA_STATE_DISPLAY } from '@lemedia/shared';
import type { MediaStatus } from './mediaStatusCache';

/** What the quick-request "+" on a poster should do.
 *
 *  `request` sends the request straight away (a series means the whole show); `details` opens the
 *  title so a quality can be chosen; `none` hides the control.
 *
 *  Only a title that is genuinely missing gets a "+": UPCOMING, PROCESSING and IMPORTED all mean
 *  the title is already tracked, so offering a request there would suggest it had not been added.
 *  The one exception is an upgrade of something already available with an untaken quality option,
 *  which opens the page so the quality can be picked.
 */
export function cardRequestAction(availability: MediaStatus | null | undefined, enabled: boolean): 'none' | 'details' | 'request' {
  // Unknown availability is still loading, never permission to create a request.
  if (!enabled || !availability || availability.statusCategory === 'BLACKLISTED') return 'none';
  const freeQuality = availability.hasFreeQualityOption ?? false;
  if (!canRequest(availability.statusCategory, availability.requestStatus ?? null, freeQuality)) return 'none';
  if (availability.statusCategory === 'AVAILABLE' && freeQuality) return 'details';
  return MEDIA_STATE_DISPLAY[availability.statusCategory].showsRequestCTA ? 'request' : 'none';
}

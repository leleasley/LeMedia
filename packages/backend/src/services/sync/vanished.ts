/**
 * Detecting titles that were removed from a *arr instance.
 *
 * The webhook normally reports deletions, but if it doesn't fire — instance down, webhook
 * misconfigured, proxy hiccup — the title stays "available" in LeMedia forever, and the user is
 * told they already have a film they no longer do. The sync already holds the instance's entire
 * library in memory (`getAllMedia()`), so comparing it against our own rows costs no extra *arr
 * call.
 *
 * Kept as a pure module (no DB, no providers) so it can be unit-tested on its own — importing
 * mediaSync.ts would drag in the whole service graph.
 */

export interface OwnedArrRow {
  id: number;
  title: string;
  radarrId: number | null;
  sonarrId: number | null;
}

export interface VanishedDecision {
  /** Rows whose *arr id is no longer listed by the instance. */
  vanished: OwnedArrRow[];
  /** True when the vanished set is too large to be deletions (a library reset). */
  resetSuspected: boolean;
}

/**
 * Decide which tracked rows no longer exist in the service.
 *
 * `presentArrIds` are the *arr ids the instance currently lists. A row is gone when it has an
 * id and the instance doesn't list it.
 *
 * Safety valve: a wholesale wipe or reinstall of the *arr re-issues every id, which would look
 * like "the entire library vanished". If the vanished set is a large fraction of what we own,
 * that is a library reset rather than a batch of deletions, so nothing is marked — the admin
 * re-syncs instead.
 */
export function selectVanished(
  owned: OwnedArrRow[],
  presentArrIds: ReadonlySet<number>,
  arrIdField: 'radarrId' | 'sonarrId',
  ratioLimit = 0.25,
): VanishedDecision {
  const gone = owned.filter((row) => {
    const arrId = arrIdField === 'radarrId' ? row.radarrId : row.sonarrId;
    return arrId != null && !presentArrIds.has(arrId);
  });
  if (gone.length === 0) return { vanished: [], resetSuspected: false };
  // Never mark a wholesale wipe as "thousands of titles vanished".
  const resetSuspected = gone.length > Math.max(50, owned.length * ratioLimit);
  return { vanished: resetSuspected ? [] : gone, resetSuspected };
}

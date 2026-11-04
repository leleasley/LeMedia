import { describe, it, expect } from 'vitest';
import { selectVanished, type OwnedArrRow } from '../src/services/sync/vanished.js';

/**
 * Guards the "title removed from the *arr" detection used by the sync. The webhook normally
 * reports deletions; this is the safety net for when it doesn't fire.
 */

const row = (id: number, arrId: number | null): OwnedArrRow => ({
  id,
  title: `Title ${id}`,
  radarrId: arrId,
  sonarrId: arrId,
});

describe('selectVanished', () => {
  it('flags a tracked title the service no longer lists', () => {
    const owned = [row(1, 100), row(2, 200), row(3, 300)];
    const present = new Set([100, 300]); // 200 was deleted in the service
    const result = selectVanished(owned, present, 'radarrId');
    expect(result.vanished.map((r) => r.id)).toEqual([2]);
    expect(result.resetSuspected).toBe(false);
  });

  it('ignores rows that never had an *arr id', () => {
    const owned = [row(1, null), row(2, null)];
    const result = selectVanished(owned, new Set<number>(), 'radarrId');
    expect(result.vanished).toEqual([]);
  });

  it('uses the id field of the service being synced', () => {
    const owned: OwnedArrRow[] = [{ id: 1, title: 'T', radarrId: 100, sonarrId: 900 }];
    // The TV instance lists 900 — the row is present, even though its radarr id is not.
    expect(selectVanished(owned, new Set([900]), 'sonarrId').vanished).toEqual([]);
    expect(selectVanished(owned, new Set([900]), 'radarrId').vanished.map((r) => r.id)).toEqual([1]);
  });

  it('treats a wholesale wipe as a library reset and marks nothing', () => {
    // Radarr was reinstalled: every id changed, so every tracked title looks absent.
    const owned = Array.from({ length: 500 }, (_, i) => row(i + 1, i + 1));
    const result = selectVanished(owned, new Set<number>(), 'radarrId');
    expect(result.resetSuspected).toBe(true);
    expect(result.vanished).toEqual([]);
  });

  it('still flags a small number of deletions on a large library', () => {
    const owned = Array.from({ length: 500 }, (_, i) => row(i + 1, i + 1));
    const present = new Set(owned.map((r) => r.radarrId!).filter((id) => id !== 7 && id !== 9));
    const result = selectVanished(owned, present, 'radarrId');
    expect(result.resetSuspected).toBe(false);
    expect(result.vanished.map((r) => r.id)).toEqual([7, 9]);
  });

  it('flags nothing when the service still lists everything', () => {
    const owned = [row(1, 100), row(2, 200)];
    const result = selectVanished(owned, new Set([100, 200]), 'radarrId');
    expect(result.vanished).toEqual([]);
    expect(result.resetSuspected).toBe(false);
  });
});

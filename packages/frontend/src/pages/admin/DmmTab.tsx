import { AdminTabLayout } from './AdminTabLayout';
import { DmmWanted } from './arr/DmmWanted';

/** Admin → Media → DMM wanted: hand a Radarr/Sonarr backup to DMM for zurg to fetch. */
export function DmmTab() {
  return (
    <AdminTabLayout>
      <DmmWanted />
    </AdminTabLayout>
  );
}

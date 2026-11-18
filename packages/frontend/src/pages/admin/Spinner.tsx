import { Spinner as RingSpinner } from '@/components/Spinner';

/** Admin section loader: the shared brand ring, centred for a whole panel. */
export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <RingSpinner />
    </div>
  );
}

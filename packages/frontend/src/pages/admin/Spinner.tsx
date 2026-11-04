import { Loader2 } from 'lucide-react';

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-6 h-6 text-ndp-text-dim animate-spin" />
    </div>
  );
}

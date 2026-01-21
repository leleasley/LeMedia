import {
  CheckCircleIcon,
  ClockIcon,
  BellIcon,
  EyeSlashIcon,
  MinusSmallIcon,
  TrashIcon,
  ArrowDownTrayIcon
} from "@heroicons/react/24/solid";
import { Loader2 } from "lucide-react";
import { MediaStatus } from "@/lib/media-status";

// Re-export MediaStatus for backwards compatibility
export { MediaStatus } from "@/lib/media-status";

interface StatusBadgeMiniProps {
  status: MediaStatus;
  inProgress?: boolean;
  shrink?: boolean;
}

export function StatusBadgeMini({
  status,
  inProgress = false,
  shrink = false,
}: StatusBadgeMiniProps) {
  const badgeStyle = [
    `rounded-full bg-opacity-80 shadow-md ${
      shrink ? 'w-4 sm:w-5 border p-0' : 'w-5 ring-1 p-0.5'
    }`,
  ];

  let indicatorIcon: React.ReactNode;

  switch (status) {
    case MediaStatus.DOWNLOADING:
      badgeStyle.push(
        'bg-blue-500 border-blue-400 ring-blue-400 text-blue-100'
      );
      indicatorIcon = <ArrowDownTrayIcon />;
      break;
    case MediaStatus.PROCESSING:
      badgeStyle.push(
        'bg-indigo-500 border-indigo-400 ring-indigo-400 text-indigo-100'
      );
      indicatorIcon = <ClockIcon />;
      break;
    case MediaStatus.AVAILABLE:
      badgeStyle.push(
        'bg-green-500 border-green-400 ring-green-400 text-green-100'
      );
      indicatorIcon = <CheckCircleIcon />;
      break;
    case MediaStatus.PENDING:
      badgeStyle.push(
        'bg-yellow-500 border-yellow-400 ring-yellow-400 text-yellow-100'
      );
      indicatorIcon = <BellIcon />;
      break;
    case MediaStatus.BLACKLISTED:
      badgeStyle.push('bg-red-500 border-white-400 ring-white-400 text-white');
      indicatorIcon = <EyeSlashIcon />;
      break;
    case MediaStatus.PARTIALLY_AVAILABLE:
      badgeStyle.push(
        'bg-purple-500 border-purple-400 ring-purple-400 text-purple-100'
      );
      indicatorIcon = <MinusSmallIcon />;
      break;
    case MediaStatus.DELETED:
      badgeStyle.push('bg-red-500 border-red-400 ring-red-400 text-red-100');
      indicatorIcon = <TrashIcon />;
      break;
  }

  if (inProgress) {
    indicatorIcon = <Loader2 className="animate-spin" />;
  }

  return (
    <div
      className={`relative inline-flex whitespace-nowrap rounded-full border-gray-700 text-xs font-semibold leading-5 ring-gray-700 ${
        shrink ? '' : 'ring-1'
      }`}
    >
      <div className={badgeStyle.join(' ')}>{indicatorIcon}</div>
    </div>
  );
}

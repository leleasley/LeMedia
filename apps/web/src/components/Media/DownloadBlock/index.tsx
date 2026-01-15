import Badge from '@/components/Common/Badge';
import { Permission, useUser } from '@/hooks/useUser';
import defineMessages from '@/utils/defineMessages';
import type { DownloadingItem } from '@/types/server/lib/downloadtracker';
import { useEffect, useState } from 'react';
import { FormattedRelativeTime, useIntl } from 'react-intl';

const messages = defineMessages('components.DownloadBlock', {
  estimatedtime: 'Estimated {time}',
  formattedTitle: '{title}: Season {seasonNumber} Episode {episodeNumber}',
});

interface DownloadBlockProps {
  downloadItem: DownloadingItem;
  is4k?: boolean;
  title?: string;
}

const DownloadBlock = ({
  downloadItem,
  is4k = false,
  title,
}: DownloadBlockProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!downloadItem.estimatedCompletionTime) return;
    const updateNow = () => setNow(Date.now());
    const timeoutId = window.setTimeout(updateNow, 0);
    const intervalId = window.setInterval(updateNow, 1000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [downloadItem.estimatedCompletionTime]);

  return (
    <div className="p-4">
      <div className="mb-2 w-56 truncate text-sm sm:w-80 md:w-full">
        {hasPermission(Permission.ADMIN)
          ? downloadItem.title
          : downloadItem.episode
          ? intl.formatMessage(messages.formattedTitle, {
              title,
              seasonNumber: downloadItem?.episode?.seasonNumber,
              episodeNumber: downloadItem?.episode?.episodeNumber,
            })
          : title}
      </div>
      <div className="relative mb-2 h-6 min-w-0 overflow-hidden rounded-full bg-gray-700">
        <div
          className="h-8 bg-indigo-600 transition-all duration-200 ease-in-out"
          style={{
            width: `${
              downloadItem.size
                ? Math.round(
                    ((downloadItem.size - downloadItem.sizeLeft) /
                      downloadItem.size) *
                      100
                  )
                : 0
            }%`,
          }}
        />
        <div className="absolute inset-0 flex h-6 w-full items-center justify-center text-xs">
          <span>
            {downloadItem.size
              ? Math.round(
                  ((downloadItem.size - downloadItem.sizeLeft) /
                    downloadItem.size) *
                    100
                )
              : 0}
            %
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span>
          {is4k && (
            <Badge badgeType="warning" className="mr-2">
              4K
            </Badge>
          )}
          <Badge className="capitalize">{downloadItem.status}</Badge>
        </span>
        <span>
          {downloadItem.estimatedCompletionTime
            ? intl.formatMessage(messages.estimatedtime, {
                time: (
                  <FormattedRelativeTime
                    value={Math.floor(
                      (new Date(
                        downloadItem.estimatedCompletionTime
                      ).getTime() -
                        now) /
                        1000
                    )}
                    updateIntervalInSeconds={1}
                    numeric="auto"
                  />
                ),
              })
            : ''}
        </span>
      </div>
    </div>
  );
};

export default DownloadBlock;

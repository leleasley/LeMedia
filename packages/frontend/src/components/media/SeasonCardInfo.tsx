import { Check, CircleDashed, CircleHelp, Clock, Download, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SeriesSeason } from '@lemedia/shared';
import type { AiredCount } from '@/hooks/useAiredSeasonCounts';

const statusIcons = {
  complete: Check,
  downloading: Download,
  requested: Clock,
  partial: CircleDashed,
  not_available: Minus,
  not_requested: CircleDashed,
  monitored: Clock,
  unknown: CircleHelp,
};

export type SeasonCardStatus = keyof typeof statusIcons;

export function SeasonCardInfo({ season, airedCount }: Readonly<{ season: SeriesSeason; airedCount?: AiredCount }>) {
  const { t } = useTranslation();
  const title = t('media.season_label', { number: season.seasonNumber });

  return <div className="season-card-info">
    <h3 className="season-card-title">{title}</h3>
    <p className="season-card-meta">
      <span>{airedCount ? t('media.explorer.aired_available', { available: airedCount.available, aired: airedCount.aired }) : season.episodeCount !== null ? t('calendar.episode_count', { count: season.episodeCount }) : t('media.explorer.count_unknown')}</span>
    </p>
  </div>;
}

export function SeasonStatusBadge({ status, id }: Readonly<{ status: SeasonCardStatus; id: string }>) {
  const { t } = useTranslation();
  const Icon = statusIcons[status];
  const label = t(`media.explorer.${status === 'partial' ? 'partial_short' : status}`);
  return <span id={id} className={`season-card-status season-status-${status}`} title={label}>
    <Icon size={12} aria-hidden="true" /><span>{label}</span>
  </span>;
}

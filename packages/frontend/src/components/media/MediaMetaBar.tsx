import { useTranslation } from 'react-i18next';
import { Calendar, Clock, Film, Globe, Star, Tv } from 'lucide-react';
import { languageName } from '@/utils/languageName';
import i18n from '@/i18n';

interface Props {
  year: string;
  runtime?: number | null;
  voteAverage?: number | null;
  voteCount?: number | null;
  numberOfSeasons?: number | null;
  type: 'movie' | 'tv';
  genres?: string;
  /** ISO 639-1 code of the language the title was made in (TMDB `original_language`). */
  originalLanguage?: string | null;
}

function Item({ icon: Icon, className, iconClassName, children }: Readonly<{
  icon: typeof Calendar; className?: string; iconClassName?: string; children: React.ReactNode;
}>) {
  return (
    <span className={`flex items-center gap-1.5${className ? ` ${className}` : ''}`}>
      <Icon className={`w-4 h-4${iconClassName ? ` ${iconClassName}` : ''}`} />
      {children}
    </span>
  );
}

/** Year, runtime, rating, season count, original language and genres — the facts under the title. */
export function MediaMetaBar({
  year, runtime, voteAverage, voteCount, numberOfSeasons, type, genres, originalLanguage,
}: Readonly<Props>) {
  const { t } = useTranslation();

  // The UI locale is synced to the instance language, so this is the language the library is
  // curated in: anything whose original language differs is a foreign title.
  const instanceLang = (i18n.language || 'en').split('-')[0].toLowerCase();
  const langName = languageName(originalLanguage);
  const isForeign = !!langName && instanceLang !== (originalLanguage || '').toLowerCase();

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-sm text-ndp-text-muted">
        {year && <Item icon={Calendar}>{year}</Item>}
        {!!runtime && (
          <Item icon={Clock}>
            {Math.floor(runtime / 60)}h{String(runtime % 60).padStart(2, '0')}
          </Item>
        )}
        {!!voteAverage && voteAverage > 0 && (
          <Item icon={Star} className="text-ndp-gold" iconClassName="fill-ndp-gold">
            {voteAverage.toFixed(1)} ({voteCount} {t('media.votes')})
          </Item>
        )}
        {type === 'tv' && !!numberOfSeasons && (
          <Item icon={Tv}>{t('media.season', { count: numberOfSeasons })}</Item>
        )}
        {langName && (
          <Item
            icon={Globe}
            className={isForeign ? 'text-ndp-accent font-semibold' : undefined}
            iconClassName={isForeign ? 'text-ndp-accent' : undefined}
          >
            <span title={t('media.original_language')}>{langName}</span>
          </Item>
        )}
        <Item icon={Film}>{type === 'movie' ? t('common.movie') : t('common.series')}</Item>
      </div>

      {genres && (
        <div className="flex flex-wrap gap-2 mt-4">
          {genres.split(', ').map((g) => (
            <span key={g} className="px-2.5 py-1 bg-white/[0.07] rounded-full text-xs font-medium text-ndp-text">
              {g}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

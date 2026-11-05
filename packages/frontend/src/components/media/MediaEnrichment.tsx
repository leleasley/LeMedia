import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';

type Rating = { source: 'imdb' | 'tomatoes' | 'metacritic'; value: number };
type Provider = { id: number; name: string; logo: string | null };
type Providers = { region: string; link: string | null; stream: Provider[]; rent: Provider[]; buy: Provider[] };
type Enrichment = { providers: Providers | null; ratings: Rating[] };

export function useMediaEnrichment(type: 'movie' | 'tv', id: number, enabled: boolean): Enrichment | null {
  const [data, setData] = useState<Enrichment | null>(null);
  useEffect(() => {
    setData(null);
    if (!enabled || !id) return;
    const controller = new AbortController();
    api.get<Enrichment>(`/tmdb/${type}/${id}/enrichment`, { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setData(response.data); })
      .catch(() => { /* These optional details must not block the media page. */ });
    return () => controller.abort();
  }, [type, id, enabled]);
  return data;
}

export function RatingsStrip({ ratings }: Readonly<{ ratings: Rating[] }>) {
  const { t } = useTranslation();
  if (!ratings.length) return null;
  const names = { imdb: 'IMDb', tomatoes: 'Rotten Tomatoes', metacritic: 'Metacritic' };
  return <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ndp-text-muted" aria-label={t('media.external_ratings', 'Ratings from MDBList')}>
    {ratings.map(r => <span key={r.source}><span className="font-semibold text-ndp-text">{names[r.source]}</span> {r.value}{r.source === 'imdb' ? '/10' : r.source === 'metacritic' ? '/100' : '%'}</span>)}
  </div>;
}

export function WhereToWatch({ providers }: Readonly<{ providers: Providers | null }>) {
  const { t } = useTranslation();
  if (!providers || ![...providers.stream, ...providers.rent, ...providers.buy].length) return null;
  const groups = [
    { label: t('media.streaming', 'Stream'), list: providers.stream },
    { label: t('media.rent', 'Rent'), list: providers.rent },
    { label: t('media.buy', 'Buy'), list: providers.buy },
  ];
  return <section className="mt-4" aria-label={t('media.where_to_watch', 'Where to watch')}>
    <h2 className="text-sm font-semibold text-ndp-text">{t('media.where_to_watch', 'Where to watch')} <span className="font-normal text-ndp-text-dim">({providers.region})</span></h2>
    <div className="mt-2 space-y-2">{groups.filter(g => g.list.length > 0).map(g => <div key={g.label} className="flex flex-wrap items-center gap-2 text-xs"><span className="text-ndp-text-dim min-w-12">{g.label}</span>{g.list.map(p => <span key={p.id} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.07] px-2 py-1 text-ndp-text-muted">{p.logo && <img src={`https://image.tmdb.org/t/p/w45${p.logo}`} alt="" className="h-5 w-5 rounded object-cover" loading="lazy" />}{p.name}</span>)}</div>)}</div>
    <p className="mt-2 text-xs text-ndp-text-dim">{providers.link ? <a href={providers.link} target="_blank" rel="noopener noreferrer" className="hover:underline">{t('media.provider_attribution', 'Streaming data provided by JustWatch via TMDB')} ↗</a> : t('media.provider_attribution', 'Streaming data provided by JustWatch via TMDB')}</p>
  </section>;
}

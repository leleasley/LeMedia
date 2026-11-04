import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function PrivacyPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const sections = [
    { key: 'operator', paragraphs: 1 },
    { key: 'information', paragraphs: 4 },
    { key: 'use', paragraphs: 2 },
    { key: 'services', paragraphs: 4 },
    { key: 'storage', paragraphs: 2 },
    { key: 'retention', paragraphs: 3 },
    { key: 'choices', paragraphs: 2 },
  ];

  return (
    <main id="main" className="min-h-dvh bg-ndp-bg text-ndp-text">
      <div className="border-b border-white/[0.07]">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <Link to={user ? '/' : '/login'} className="inline-flex items-center gap-2 text-sm text-ndp-text-muted hover:text-ndp-text transition-colors">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            {user ? t('privacy.back_app') : t('privacy.back_login')}
          </Link>
          <Link to={user ? '/' : '/login'} className="flex items-center gap-2.5 text-sm font-semibold text-ndp-text">
            <img src="/logo-v2.png" alt="" className="w-8 h-8 rounded-lg" />
            LeMedia
          </Link>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-20">
        <header className="pb-9 border-b border-white/[0.08]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ndp-accent">LeMedia</p>
          <h1 className="font-display-title text-5xl sm:text-6xl mt-3">{t('privacy.title')}</h1>
          <p className="text-base sm:text-lg leading-relaxed text-ndp-text-muted mt-5 max-w-2xl">{t('privacy.intro')}</p>
          <p className="text-xs text-ndp-text-dim mt-5">{t('privacy.updated')}</p>
          <p role="note" className="mt-6 rounded-lg border border-ndp-warning/25 bg-ndp-warning/10 px-4 py-3 text-sm leading-6 text-ndp-text-muted">{t('privacy.draft_notice')}</p>
        </header>

        <div className="divide-y divide-white/[0.08]">
          {sections.map(({ key, paragraphs }) => (
            <section key={key} className="py-8 sm:grid sm:grid-cols-[180px_1fr] sm:gap-8">
              <h2 className="text-base font-semibold text-ndp-text mb-3 sm:mb-0">{t(`privacy.${key}.title`)}</h2>
              <div className="space-y-3 text-sm sm:text-[15px] leading-7 text-ndp-text-muted">
                {Array.from({ length: paragraphs }, (_, index) => <p key={index}>{t(`privacy.${key}.p${index + 1}`)}</p>)}
              </div>
            </section>
          ))}
          <section className="py-8 sm:grid sm:grid-cols-[180px_1fr] sm:gap-8">
            <h2 className="text-base font-semibold mb-3 sm:mb-0">{t('privacy.rights.title')}</h2>
            <div className="space-y-3 text-sm sm:text-[15px] leading-7 text-ndp-text-muted">
              <p>{t('privacy.rights.p1')}</p>
              <p>{t('privacy.rights.p2')} <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer" className="text-ndp-accent hover:underline">{t('privacy.rights.ico')}</a>.</p>
            </div>
          </section>
        </div>
      </article>
    </main>
  );
}

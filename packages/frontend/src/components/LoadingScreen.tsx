import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/Spinner';

export default function LoadingScreen() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh bg-ndp-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="xl" label={t('common.loading')} />
        <p className="text-ndp-text-muted text-sm">{t('common.loading')}</p>
      </div>
    </div>
  );
}

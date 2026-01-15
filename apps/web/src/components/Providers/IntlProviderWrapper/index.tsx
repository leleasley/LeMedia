'use client';

import useLocale from '@/hooks/useLocale';
import { IntlProvider } from 'react-intl';

const IntlProviderWrapper = ({ children }: { children: React.ReactNode }) => {
  const { locale } = useLocale();

  return (
    <IntlProvider locale={locale} messages={{}}>
      {children}
    </IntlProvider>
  );
};

export default IntlProviderWrapper;

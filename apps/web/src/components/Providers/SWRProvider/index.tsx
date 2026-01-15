'use client';

import axios from 'axios';
import { SWRConfig } from 'swr';

const swrFetcher = async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input.toString();
  try {
    const response = await axios.get(url, { withCredentials: true });
    return response.data;
  } catch (err: any) {
    const error = new Error('SWR request failed');
    (error as Error & { status?: number }).status = err?.response?.status;
    throw error;
  }
};

const SWRProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
      }}
    >
      {children}
    </SWRConfig>
  );
};

export default SWRProvider;

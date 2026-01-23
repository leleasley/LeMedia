'use client';

import axios from 'axios';
import { SWRConfig } from 'swr';
import { useToast } from "@/components/Providers/ToastProvider";
import { logger } from "@/lib/logger";

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
  const toast = useToast();

  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        onError: (error, key) => {
          const status = (error as Error & { status?: number }).status;
          logger.error("[SWR] Request failed", { key: String(key), status, error: error?.message });
          const message = status ? `Request failed (${status}). Please retry.` : "Request failed. Please retry.";
          toast.error(message, { title: "Network error", timeoutMs: 5000 });
        },
        onErrorRetry: (error, key, _config, revalidate, { retryCount }) => {
          const status = (error as Error & { status?: number }).status;
          if (status && status >= 400 && status < 500) return;
          if (retryCount >= 3) return;
          setTimeout(() => revalidate({ retryCount }), 1000 * Math.pow(2, retryCount));
        }
      }}
    >
      {children}
    </SWRConfig>
  );
};

export default SWRProvider;

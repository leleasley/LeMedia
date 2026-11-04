import { useEffect, useState, lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '@/lib/api';
import LoadingScreen from '@/components/LoadingScreen';
const MediaDetailPage = lazy(() => import('@/pages/MediaDetailPage'));

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [resolved, setResolved] = useState<{ tmdbId: number; mediaType: 'movie' | 'tv' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.get(`/share/${token}`).then(({ data }) => {
      setResolved({ tmdbId: data.tmdbId, mediaType: data.mediaType });
    }).catch(() => setError('This link is invalid or expired.'));
  }, [token]);

  if (error) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-ndp-text">{error}</p>
        <Link to="/" className="btn-primary">Go home</Link>
      </div>
    );
  }
  if (!resolved || !token) return <LoadingScreen />;
  return (
    <Suspense fallback={<LoadingScreen />}>
      <MediaDetailPage type={resolved.mediaType} shareId={String(resolved.tmdbId)} shareToken={token} readOnly />
    </Suspense>
  );
}

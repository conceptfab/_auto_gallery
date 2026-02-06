import React, { useEffect } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import LoadingOverlay from '@/src/components/LoadingOverlay';
import { useStatsTracker } from '@/src/hooks/useStatsTracker';
import { useProtectedAuth } from '@/src/contexts/AuthContext';
import {
  MoodboardProvider,
  useMoodboard,
} from '@/src/contexts/MoodboardContext';

const MoodboardCanvas = dynamic(
  () => import('@/src/components/moodboard/Canvas'),
  { ssr: false }
);
const MoodboardTab = dynamic(
  () => import('@/src/components/moodboard/MoodboardTab'),
  { ssr: false }
);

function MoodboardContent({ isAdmin = false }: { isAdmin?: boolean }) {
  const { loading, loadError, saveError } = useMoodboard();
  return (
    <>
      <MoodboardTab isAdmin={isAdmin} />
      <div className="moodboard-body">
        {loading && (
          <div className="moodboard-loading-wrap">
            <div className="loading-overlay loading-overlay--moodboard">
              <div className="loading-message">Ładowanie moodboard...</div>
            </div>
          </div>
        )}
        {!loading && loadError && (
          <div className="moodboard-error-banner" role="alert">
            {loadError}{' '}
            <button
              type="button"
              className="moodboard-error-banner-btn"
              onClick={() => window.location.reload()}
            >
              Odśwież
            </button>
          </div>
        )}
        {saveError && (
          <div className="moodboard-save-error" role="alert">
            {saveError}
          </div>
        )}
        {!loading && <MoodboardCanvas />}
      </div>
    </>
  );
}

const MoodboardPage: React.FC = () => {
  const { authStatus, authLoading } = useProtectedAuth();
  const { trackDesignView } = useStatsTracker();

  useEffect(() => {
    if (!authStatus?.isLoggedIn || authLoading) return;
    trackDesignView('moodboard', 'moodboard', 'Moodboard');
  }, [authStatus?.isLoggedIn, authLoading, trackDesignView]);

  // Dodaj klasę do body, aby ukryć scrollbar na moodboardzie
  useEffect(() => {
    document.body.classList.add('moodboard-active');
    return () => {
      document.body.classList.remove('moodboard-active');
    };
  }, []);

  if (authLoading && !authStatus) {
    return <LoadingOverlay message="Sprawdzanie autoryzacji..." />;
  }

  if (!authStatus?.isLoggedIn) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Moodboard – ConceptView</title>
        <meta
          name="description"
          content="Moodboard – tablica nastrojów z obrazkami i komentarzami"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="design-page moodboard-page">
        <MoodboardProvider>
          <MoodboardContent isAdmin={authStatus?.isAdmin ?? false} />
        </MoodboardProvider>
      </main>
    </>
  );
};

export default MoodboardPage;


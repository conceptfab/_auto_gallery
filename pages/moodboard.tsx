import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import LoadingOverlay from '@/src/components/LoadingOverlay';
import { useStatsTracker } from '@/src/hooks/useStatsTracker';
import { useProtectedAuth } from '@/src/contexts/AuthContext';
import {
  MoodboardProvider,
  useMoodboard,
} from '@/src/contexts/MoodboardContext';
import type { UserGroup } from '@/src/types/admin';

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
  const [groups, setGroups] = useState<UserGroup[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/auth/admin/groups/list', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((data) => setGroups(data.groups ?? []))
      .catch(() => setGroups([]));
  }, [isAdmin]);

  return (
    <>
      <MoodboardTab isAdmin={isAdmin} groups={groups} />
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

const ALL_GROUPS_ID = '__all__';

const MoodboardPage: React.FC = () => {
  const router = useRouter();
  const { authStatus, authLoading } = useProtectedAuth();
  const { trackDesignView } = useStatsTracker();
  const queryGroupId = router.query.groupId as string | undefined;
  // Admin bez wyboru grupy w URL = domyślnie widzi WSZYSTKIE moodboardy
  const selectedGroupId =
    authStatus?.isAdmin && queryGroupId === undefined
      ? ALL_GROUPS_ID
      : queryGroupId;

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
        <title>Moodboard – ConceptDesk</title>
        <meta
          name="description"
          content="Moodboard – tablica nastrojów z obrazkami i komentarzami"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="design-page moodboard-page">
        <MoodboardProvider selectedGroupId={selectedGroupId}>
          <MoodboardContent isAdmin={authStatus?.isAdmin ?? false} />
        </MoodboardProvider>
      </main>
    </>
  );
};

export default MoodboardPage;

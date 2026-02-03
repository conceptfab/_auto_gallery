import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import LoadingOverlay from '@/src/components/LoadingOverlay';
import {
  MoodboardProvider,
  useMoodboard,
} from '@/src/contexts/MoodboardContext';

const MoodboardToolbar = dynamic(
  () => import('@/src/components/moodboard/Toolbar'),
  { ssr: false }
);
const MoodboardCanvas = dynamic(
  () => import('@/src/components/moodboard/Canvas'),
  { ssr: false }
);

function MoodboardContent() {
  const { loading, loadError, saveError } = useMoodboard();
  if (loading) {
    return <LoadingOverlay message="Ładowanie moodboarda..." />;
  }
  return (
    <>
      {loadError && (
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
      <MoodboardToolbar />
      <MoodboardCanvas />
    </>
  );
}

interface AuthStatus {
  isLoggedIn: boolean;
  email: string | null;
  isAdmin: boolean;
}

const MoodboardPage: React.FC = () => {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/auth/status');
        const status: AuthStatus = await response.json();
        setAuthStatus(status);
        if (!status.isLoggedIn) {
          router.push('/login');
          return;
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    checkAuthStatus();
  }, [router]);

  if (loading) {
    return <LoadingOverlay message="Sprawdzanie autoryzacji..." />;
  }

  if (!authStatus?.isLoggedIn) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Moodboard – CONCEPTFAB Content Browser</title>
        <meta
          name="description"
          content="Moodboard – tablica nastrojów z obrazkami i komentarzami"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="design-page moodboard-page">
        <MoodboardProvider>
          <MoodboardContent />
        </MoodboardProvider>
      </main>
    </>
  );
};

export default MoodboardPage;

export async function getServerSideProps() {
  return {
    props: {},
  };
}

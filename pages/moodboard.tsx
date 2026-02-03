import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import LoadingOverlay from '@/src/components/LoadingOverlay';

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
          content="Moodboard – CONCEPTFAB Content Browser"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="design-page">
        <h1 className="design-page-title">Moodboard</h1>
        <p className="design-page-intro">Strona w przygotowaniu.</p>
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

import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Gallery from '@/src/components/Gallery';
import LoadingOverlay from '@/src/components/LoadingOverlay';

interface HomePageProps {
  refreshKey?: number;
}

interface UserGroupInfo {
  id: string;
  name: string;
  clientName: string;
  galleryFolder: string;
}

interface AuthStatus {
  isLoggedIn: boolean;
  email: string | null;
  isAdmin: boolean;
  group: UserGroupInfo | null;
}

const HomePage: React.FC<HomePageProps> = ({ refreshKey }) => {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Parametr groupId dla podglądu admina
  const groupId = router.query.groupId as string | undefined;

  useEffect(() => {
    checkAuthStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

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

  if (loading) {
    return <LoadingOverlay message="Sprawdzanie autoryzacji..." />;
  }

  if (!authStatus?.isLoggedIn) {
    return null; // Przekierowanie w toku
  }
  return (
    <>
      <Head>
        <title>{authStatus?.isAdmin ? 'ADMIN - ' : ''}Content Browser</title>
        <meta name="description" content="Content Browser" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <Gallery
          refreshKey={refreshKey}
          groupId={groupId}
          isAdmin={authStatus?.isAdmin ?? false}
        />
      </main>
    </>
  );
};

export default HomePage;

// Disable static generation to avoid router issues
export async function getServerSideProps() {
  return {
    props: {},
  };
}

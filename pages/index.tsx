import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Gallery from '@/src/components/Gallery';

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
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 100, color: '#666' }}>Sprawdzanie autoryzacji...</div>
      </div>
    );
  }

  if (!authStatus?.isLoggedIn) {
    return null; // Przekierowanie w toku
  }
  return (
    <>
      <Head>
        <title>{authStatus?.isAdmin ? 'ADMIN - ' : ''}CONCEPTFAB Content Browser</title>
        <meta name="description" content="CONCEPTFAB Content Browser" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <Gallery refreshKey={refreshKey} groupId={groupId} />
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
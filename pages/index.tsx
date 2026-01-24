import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Gallery from '@/src/components/Gallery';

interface HomePageProps {
  refreshKey?: number;
}

interface AuthStatus {
  isLoggedIn: boolean;
  email: string | null;
}

const HomePage: React.FC<HomePageProps> = ({ refreshKey }) => {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);

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
        <div>Sprawdzanie autoryzacji...</div>
      </div>
    );
  }

  if (!authStatus?.isLoggedIn) {
    return null; // Przekierowanie w toku
  }
  return (
    <>
      <Head>
        <title>CONCEPTFAB AutoGallery - Galeria obrazów</title>
        <meta name="description" content="CONCEPTFAB AutoGallery - Automatyczna galeria obrazów z conceptfab.com" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <Gallery refreshKey={refreshKey} />
      </main>
    </>
  );
};

export default HomePage;
import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Gallery from '@/src/components/Gallery';
import LoadingOverlay from '@/src/components/LoadingOverlay';
import { useProtectedAuth } from '@/src/contexts/AuthContext';

interface HomePageProps {
  refreshKey?: number;
}

const HomePage: React.FC<HomePageProps> = ({ refreshKey }) => {
  const router = useRouter();
  const { authStatus, authLoading } = useProtectedAuth();

  // Parametr groupId dla podglądu admina
  const groupId = router.query.groupId as string | undefined;

  if (authLoading && !authStatus) {
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

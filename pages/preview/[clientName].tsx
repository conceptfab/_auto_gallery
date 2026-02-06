import React from 'react';
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import Gallery from '@/src/components/Gallery';
import LoadingOverlay from '@/src/components/LoadingOverlay';
import { useProtectedAuth } from '@/src/contexts/AuthContext';
import { getGroupByClientName } from '@/src/utils/storage';

interface PreviewPageProps {
  groupId: string;
  clientName: string;
}

const PreviewPage: React.FC<PreviewPageProps> = ({ groupId, clientName }) => {
  const { authStatus, authLoading } = useProtectedAuth();

  if (authLoading && !authStatus) {
    return <LoadingOverlay message="Sprawdzanie autoryzacji..." />;
  }

  if (!authStatus?.isLoggedIn) {
    return null;
  }

  return (
    <>
      <Head>
        <title>{clientName} – Content Browser</title>
        <meta name="description" content={`Podgląd: ${clientName}`} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <Gallery
          groupId={groupId}
          isAdmin={authStatus?.isAdmin ?? false}
        />
      </main>
    </>
  );
};

export default PreviewPage;

export const getServerSideProps: GetServerSideProps<PreviewPageProps> = async (ctx) => {
  const clientName = ctx.params?.clientName;
  if (!clientName || typeof clientName !== 'string') {
    return { notFound: true };
  }

  const decoded = decodeURIComponent(clientName);
  const group = await getGroupByClientName(decoded);
  if (!group) {
    return { notFound: true };
  }

  return {
    props: {
      groupId: group.id,
      clientName: group.clientName,
    },
  };
};

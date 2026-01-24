import React from 'react';
import Head from 'next/head';
import Gallery from '@/src/components/Gallery';

interface HomePageProps {
  refreshKey?: number;
}

const HomePage: React.FC<HomePageProps> = ({ refreshKey }) => {
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
import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import TopMenuBar from '@/src/components/TopMenuBar';
import { useState } from 'react';

export default function App({ Component, pageProps }: AppProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  
  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <>
      <TopMenuBar onRefresh={handleRefresh} />
      <Component {...pageProps} refreshKey={refreshKey} />
    </>
  );
}
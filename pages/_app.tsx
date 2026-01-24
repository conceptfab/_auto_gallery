import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import TopMenuBar from '@/src/components/TopMenuBar';
import { useState } from 'react';
import { useRouter } from 'next/router';

export default function App({ Component, pageProps }: AppProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const router = useRouter();
  
  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Ukryj TopMenuBar na stronach logowania
  const hideTopMenuBar = router.pathname === '/login' || router.pathname === '/admin-login';

  return (
    <>
      {!hideTopMenuBar && <TopMenuBar onRefresh={handleRefresh} />}
      <Component {...pageProps} refreshKey={refreshKey} />
    </>
  );
}
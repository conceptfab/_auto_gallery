import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import 'line-awesome/dist/line-awesome/css/line-awesome.min.css';

// Dynamically import TopMenuBar to avoid SSR issues
const DynamicTopMenuBar = dynamic(() => import('@/src/components/TopMenuBar'), {
  ssr: false
});

export default function App({ Component, pageProps }: AppProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  
  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <>
      <DynamicTopMenuBar onRefresh={handleRefresh} />
      <Component {...pageProps} refreshKey={refreshKey} />
    </>
  );
}
import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import 'line-awesome/dist/line-awesome/css/line-awesome.min.css';

// Dynamically import TopMenuBar to avoid SSR issues
const DynamicTopMenuBar = dynamic(() => import('@/src/components/TopMenuBar'), {
  ssr: false
});

interface GroupInfo {
  id: string;
  name: string;
  clientName: string;
  galleryFolder: string;
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [clientName, setClientName] = useState<string | undefined>(undefined);
  
  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Pobierz nazwę klienta gdy admin podgląda grupę
  useEffect(() => {
    const groupId = router.query.groupId as string | undefined;
    
    if (groupId) {
      // Pobierz informacje o grupie
      fetch('/api/auth/admin/groups/list')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.groups) {
            const group = data.groups.find((g: GroupInfo) => g.id === groupId);
            if (group) {
              setClientName(group.clientName);
            }
          }
        })
        .catch(err => console.error('Error fetching group info:', err));
    } else {
      setClientName(undefined);
    }
  }, [router.query.groupId]);

  return (
    <>
      <DynamicTopMenuBar onRefresh={handleRefresh} clientName={clientName} />
      <Component {...pageProps} refreshKey={refreshKey} />
    </>
  );
}
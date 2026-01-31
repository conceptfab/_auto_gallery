import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import 'line-awesome/dist/line-awesome/css/line-awesome.min.css';
import { NotificationProvider } from '@/src/components/GlobalNotification';
import { SettingsProvider } from '@/src/contexts/SettingsContext';

// Dynamically import TopMenuBar to avoid SSR issues
const DynamicTopMenuBar = dynamic(() => import('@/src/components/TopMenuBar'), {
  ssr: false,
});

interface GroupInfo {
  id: string;
  name: string;
  clientName: string;
  galleryFolder: string;
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [clientName, setClientName] = useState<string | undefined>(undefined);
  const [showLandscapeWarning, setShowLandscapeWarning] = useState(false);

  // Funkcja do blokowania orientacji (wymaga fullscreen)
  const lockPortrait = useCallback(async () => {
    try {
      if (screen.orientation && 'lock' in screen.orientation) {
        const lock = (
          screen.orientation as {
            lock?: (orientation: string) => Promise<void>;
          }
        ).lock;
        if (typeof lock === 'function') {
          await lock('portrait');
        }
      }
    } catch (_err) {
      // Blokowanie orientacji nie jest wspierane lub wymaga fullscreen
    }
  }, []);

  // Sprawdzanie orientacji tylko na smartfonach (bez tabletów)
  useEffect(() => {
    const checkOrientation = () => {
      const userAgent = navigator.userAgent;
      // Wykryj tylko telefony - wyklucz tablety (iPad, tablet Android)
      const isPhone =
        /iPhone|iPod/i.test(userAgent) ||
        (/Android/i.test(userAgent) && /Mobile/i.test(userAgent));
      const isLandscape =
        window.innerWidth > window.innerHeight && window.innerWidth < 900;
      setShowLandscapeWarning(isPhone && isLandscape);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    // Próba zablokowania orientacji
    lockPortrait();

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [lockPortrait]);

  // Pobierz nazwę klienta gdy admin podgląda grupę lub na stronie folders
  useEffect(() => {
    const groupId = router.query.groupId as string | undefined;
    const isFoldersPage = router.pathname === '/folders';

    if (groupId) {
      // Pobierz informacje o grupie
      fetch('/api/auth/admin/groups/list')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.groups) {
            const group = data.groups.find((g: GroupInfo) => g.id === groupId);
            if (group) {
              setClientName(group.clientName);
            }
          }
        })
        .catch((err) => console.error('Error fetching group info:', err));
    } else if (isFoldersPage) {
      // Na stronie folders pobierz nazwę klienta z API
      fetch('/api/folders')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.clientName) {
            setClientName(data.clientName);
          }
        })
        .catch((err) =>
          console.error('Error fetching folders client name:', err)
        );
    } else {
      setClientName(undefined);
    }
  }, [router.query.groupId, router.pathname]);

  return (
    <NotificationProvider>
      <SettingsProvider>
        {showLandscapeWarning && (
          <div className="landscape-warning">
            <div className="landscape-warning-content">
              <span className="landscape-warning-icon">📱</span>
              <p>Obróć urządzenie do pozycji pionowej</p>
              <small>Aplikacja działa najlepiej w trybie portrait</small>
            </div>
          </div>
        )}
        {router.pathname !== '/folders' && (
          <DynamicTopMenuBar clientName={clientName} />
        )}
        <Component {...pageProps} refreshKey={0} />
      </SettingsProvider>
    </NotificationProvider>
  );
}

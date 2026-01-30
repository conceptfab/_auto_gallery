import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import 'line-awesome/dist/line-awesome/css/line-awesome.min.css';

interface FolderItem {
  name: string;
  path: string;
  thumbnailUrl: string | null;
}

interface FoldersResponse {
  success: boolean;
  clientName: string;
  folders: FolderItem[];
  error?: string;
}

interface AuthStatus {
  isLoggedIn: boolean;
  email: string | null;
  isAdmin: boolean;
}

const FoldersPage: React.FC = () => {
  const router = useRouter();
  const { groupId } = router.query;
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [_data, setData] = useState<FoldersResponse | null>(null);
  const [_loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        setAuthLoading(false);
      }
    };

    checkAuthStatus();
  }, [router]);

  useEffect(() => {
    if (!router.isReady || authLoading || !authStatus?.isLoggedIn) return;

    const fetchFolders = async () => {
      try {
        setLoading(true);
        setError(null);

        const apiUrl = groupId
          ? `/api/folders?groupId=${groupId}`
          : '/api/folders';

        const response = await fetch(apiUrl);

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const result: FoldersResponse = await response.json();

        if (result.success) {
          setData(result);
        } else {
          setError(result.error || 'Błąd pobierania danych');
        }
      } catch (err: unknown) {
        console.error('Error fetching folders:', err);
        setError(`Błąd połączenia: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    };

    fetchFolders();
  }, [router.isReady, groupId, authLoading, authStatus]);

  const _getThumbnailUrl = (folder: FolderItem): string => {
    if (folder.thumbnailUrl) {
      // Jeśli jest folder_thumb.png, użyj go
      return folder.thumbnailUrl.startsWith('http')
        ? `/api/image-proxy?url=${encodeURIComponent(folder.thumbnailUrl)}&size=thumb`
        : folder.thumbnailUrl;
    }
    // Placeholder jeśli brak miniaturki
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="18" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EFolder%3C/text%3E%3C/svg%3E';
  };

  return (
    <>
      <Head>
        <title>Foldery</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="folders-page">
        <div className="folders-container">
          <div className="folders-grid">
            {Array.from({ length: 9 }, (_, boxIndex) => (
              <div key={boxIndex} className="folders-box"></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default FoldersPage;

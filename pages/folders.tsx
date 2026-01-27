import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import LoadingOverlay from '../src/components/LoadingOverlay';
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
  const [data, setData] = useState<FoldersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      } catch (err: any) {
        console.error('Error fetching folders:', err);
        setError(`Błąd połączenia: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchFolders();
  }, [router.isReady, groupId, authLoading, authStatus]);

  const getThumbnailUrl = (folder: FolderItem): string => {
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
        <style jsx global>{`
          .folders-page {
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
          }

          .folders-container {
            max-width: 100%;
            margin: 0 auto;
          }

          .folders-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            grid-template-rows: repeat(3, 1fr);
            gap: 4px;
            margin-top: 20px;
            height: 80vh;
            width: 80vh;
            max-width: 90vw;
            margin-left: auto;
            margin-right: auto;
            background: #000;
          }

          .folders-box {
            border-radius: 8px;
          }

          .folders-box:nth-child(1) { background: #ff6b6b !important; }
          .folders-box:nth-child(2) { background: #4ecdc4 !important; }
          .folders-box:nth-child(3) { background: #45b7d1 !important; }
          .folders-box:nth-child(4) { background: #96ceb4 !important; }
          .folders-box:nth-child(5) { background: #feca57 !important; }
          .folders-box:nth-child(6) { background: #ff9ff3 !important; }
          .folders-box:nth-child(7) { background: #54a0ff !important; }
          .folders-box:nth-child(8) { background: #5f27cd !important; }
          .folders-box:nth-child(9) { background: #00d2d3 !important; }

          .folders-image-wrapper {
            position: relative;
            width: 100%;
            padding-top: 75%;
            background: #f5f5f5;
          }

          .folders-image-wrapper img {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
          }

          .folders-image-info {
            padding: 15px;
          }

          .folders-image-info h3 {
            margin: 0;
            font-size: 16px;
            color: #333;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .folders-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            color: white;
          }

          .folders-spinner {
            width: 50px;
            height: 50px;
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: folders-spin 1s linear infinite;
            margin-bottom: 1rem;
          }

          @keyframes folders-spin {
            to {
              transform: rotate(360deg);
            }
          }

          .folders-error {
            text-align: center;
            padding: 4rem 2rem;
            color: white;
          }

          .folders-button {
            background: white;
            color: #667eea;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
          }

          .folders-empty {
            text-align: center;
            padding: 4rem 2rem;
            color: white;
          }
        `}</style>
      </Head>

      <div className="folders-page">
        <div className="folders-container">
          <div className="folders-grid">
            {Array.from({ length: 9 }, (_, boxIndex) => (
              <div key={boxIndex} className="folders-box">
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default FoldersPage;

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { logger } from '../utils/logger';
import { useNotification } from './GlobalNotification';

interface TopMenuBarProps {
  onRefresh?: () => void;
  clientName?: string;
}

interface AuthStatus {
  isLoggedIn: boolean;
  email: string | null;
  isAdmin: boolean;
}

interface VersionInfo {
  hash: string;
  date: string;
  message: string;
  buildTime: string;
}

interface CacheStatusInfo {
  enabled: boolean;
  thumbnailsCount: number;
  filesCount: number;
}

const TopMenuBar: React.FC<TopMenuBarProps> = ({ onRefresh, clientName }) => {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatusInfo | null>(null);
  const { showError, showSuccess, showInfo: _showInfo } = useNotification();

  // Hide on login pages
  const isLoginPage =
    router.pathname === '/login' || router.pathname === '/admin-login';

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/status');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const status: AuthStatus = await response.json();
      setAuthStatus(status);
    } catch (error) {
      logger.error('Error checking auth status', error);
      // Nie pokazuj błędu - to normalne sprawdzenie przy ładowaniu
    }
  };

  const loadVersionInfo = async () => {
    try {
      const response = await fetch('/version.json');
      if (response.ok) {
        const version: VersionInfo = await response.json();
        setVersionInfo(version);
      }
    } catch (error) {
      logger.error('Error loading version info', error);
    }
  };

  const checkCacheStatus = async () => {
    try {
      const response = await fetch('/api/admin/cache/status');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCacheStatus({
            enabled: data.status.scheduler.enabled,
            thumbnailsCount: data.status.thumbnails.totalGenerated || 0,
            filesCount: data.status.hashChecker.totalFiles || 0,
          });
        }
      }
    } catch {
      // Cache status niedostępny - nie loguj błędu
      setCacheStatus({ enabled: false, thumbnailsCount: 0, filesCount: 0 });
    }
  };

  useEffect(() => {
    checkAuthStatus();
    loadVersionInfo();
    checkCacheStatus();
  }, []);

  // Odśwież status autoryzacji przy zmianie strony
  useEffect(() => {
    checkAuthStatus();
  }, [router.pathname]);

  if (isLoginPage) {
    return null;
  }

  const handleLogout = async () => {
    try {
      if (authStatus?.isAdmin) {
        const response = await fetch('/api/auth/admin/logout', {
          method: 'POST',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        showSuccess('Wylogowano pomyślnie');
        router.push('/admin-login');
      } else {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        showSuccess('Wylogowano pomyślnie');
        router.push('/login');
      }
    } catch (error) {
      logger.error('Error logging out', error);
      showError('Błąd podczas wylogowywania', 'Błąd');
    }
  };

  return (
    <nav className="top-menu-bar">
      <div className="menu-container">
        <div className="menu-left">
          <div className="logo">
            <h1>
              CONCEPTFAB Content Browser
              <span className="version">
                ver: {versionInfo?.message?.split(':')[0] ?? versionInfo?.message ?? ''}
                {versionInfo?.date ? ` ${versionInfo.date}` : ''}
              </span>
            </h1>
          </div>
        </div>

        <div className="menu-center">
          {clientName && (
            <span
              style={{
                fontSize: '1.1rem',
                fontWeight: 300,
                color: '#9C27B0',
                padding: '4px 12px',
                backgroundColor: 'rgba(156, 39, 176, 0.1)',
                borderRadius: '4px',
              }}
            >
              {clientName}
            </span>
          )}
        </div>

        <div className="menu-right">
          {/* Cache status indicator */}
          {cacheStatus && (
            <div
              title={
                cacheStatus.thumbnailsCount > 0
                  ? `Cache aktywny: ${cacheStatus.thumbnailsCount} miniaturek, ${cacheStatus.filesCount} plików`
                  : 'Cache nieaktywny - brak miniaturek'
              }
              style={{
                padding: '6px',
                fontSize: '20px',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
                backgroundColor:
                  cacheStatus.thumbnailsCount > 0 ? 'transparent' : '#fee2e2',
                marginRight: '4px',
              }}
            >
              <i
                className="las la-microchip"
                style={{
                  color: cacheStatus.thumbnailsCount > 0 ? '#059669' : '#dc2626',
                }}
              ></i>
            </div>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Odśwież"
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                padding: '6px',
                cursor: 'pointer',
                fontSize: '27px',
                width: '48px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <i className="las la-sync" style={{ color: '#5c5c5c' }}></i>
            </button>
          )}
          {authStatus?.isLoggedIn && (
            <>
              {authStatus.isAdmin && router.pathname !== '/admin' && (
                <button
                  onClick={() => router.push('/admin')}
                  title="Panel admina"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    padding: '6px',
                    cursor: 'pointer',
                    fontSize: '27px',
                    width: '48px',
                    height: '48px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <i className="las la-tools" style={{ color: '#f44336' }}></i>
                </button>
              )}
              {authStatus.isAdmin && router.pathname === '/admin' && (
                <button
                  onClick={() => window.open('/', '_blank')}
                  title="Galeria"
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    padding: '6px',
                    cursor: 'pointer',
                    fontSize: '27px',
                    width: '48px',
                    height: '48px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <i className="lar la-images" style={{ color: '#5c5c5c' }}></i>
                </button>
              )}
              <span
                style={{
                  fontSize: '14px',
                  color: '#666',
                  textAlign: 'center',
                }}
              >
                {authStatus.email}
              </span>
              <button
                onClick={handleLogout}
                title="Wyloguj"
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  padding: '6px',
                  cursor: 'pointer',
                  fontSize: '27px',
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <i
                  className="las la-sign-out-alt"
                  style={{ color: '#5c5c5c' }}
                ></i>
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default TopMenuBar;

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

interface TopMenuBarProps {
  onRefresh?: () => void;
}

interface AuthStatus {
  isLoggedIn: boolean;
  email: string | null;
}

interface VersionInfo {
  hash: string;
  date: string;
  message: string;
  buildTime: string;
}

const TopMenuBar: React.FC<TopMenuBarProps> = ({ onRefresh }) => {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  
  // Hide on login pages
  const isLoginPage = router.pathname === '/login' || router.pathname === '/admin-login';
  
  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/status');
      const status: AuthStatus = await response.json();
      setAuthStatus(status);
    } catch (error) {
      console.error('Error checking auth status:', error);
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
      console.error('Error loading version info:', error);
    }
  };

  useEffect(() => {
    checkAuthStatus();
    loadVersionInfo();
  }, []);
  
  if (isLoginPage) {
    return null;
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <nav className="top-menu-bar">
      <div className="menu-container">
        <div className="menu-left">
          <div className="logo">
            <h1>
              CONCEPTFAB Content Browser 
              <span className="version">{versionInfo?.message} {versionInfo?.date}</span>
            </h1>
          </div>
        </div>
        
        <div className="menu-center">
        </div>
        
        <div className="menu-right">
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
                justifyContent: 'center'
              }}
            >
              <i className="las la-sync"></i>
            </button>
          )}
          {authStatus?.isLoggedIn && (
            <>
              <span style={{ 
                fontSize: '14px', 
                color: '#666',
                textAlign: 'center'
              }}>
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
                  justifyContent: 'center'
                }}
              >
                <i className="las la-sign-out-alt"></i>
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default TopMenuBar;
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

interface TopMenuBarProps {
  onRefresh?: () => void;
}

interface AuthStatus {
  isLoggedIn: boolean;
  email: string | null;
}

const TopMenuBar: React.FC<TopMenuBarProps> = ({ onRefresh }) => {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/status');
      const status: AuthStatus = await response.json();
      setAuthStatus(status);
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  };

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
            <h1>CONCEPTFAB Content Browser</h1>
          </div>
        </div>
        
        <div className="menu-center">
        </div>
        
        <div className="menu-right">
          {onRefresh && (
            <button onClick={onRefresh} className="refresh-button">
              Odśwież
            </button>
          )}
          {authStatus?.isLoggedIn && (
            <>
              <span style={{ 
                marginLeft: '15px', 
                fontSize: '14px', 
                color: '#666' 
              }}>
                {authStatus.email}
              </span>
              <button
                onClick={handleLogout}
                title="Wyloguj"
                style={{
                  marginLeft: '10px',
                  backgroundColor: 'transparent',
                  border: '1px solid #ccc',
                  padding: '6px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                🚪
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default TopMenuBar;
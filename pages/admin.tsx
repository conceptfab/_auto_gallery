import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

interface PendingEmail {
  email: string;
  timestamp: string;
  ip: string;
}

interface AdminData {
  pending: PendingEmail[];
  whitelist: string[];
  blacklist: string[];
}

interface AdminAuthStatus {
  isAdminLoggedIn: boolean;
  email: string | null;
}

const AdminPanel: React.FC = () => {
  const router = useRouter();
  const [data, setData] = useState<AdminData>({ pending: [], whitelist: [], blacklist: [] });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const fetchData = async () => {
    try {
      const response = await fetch('/api/auth/admin/pending-emails');
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAdminAuth();
  }, []);

  useEffect(() => {
    if (authStatus?.isAdminLoggedIn) {
      fetchData();
      const interval = setInterval(fetchData, 5000); // Odświeżaj co 5 sekund
      return () => clearInterval(interval);
    }
  }, [authStatus]);

  const checkAdminAuth = async () => {
    try {
      const response = await fetch('/api/auth/admin/status');
      const status: AdminAuthStatus = await response.json();
      
      setAuthStatus(status);
      
      if (!status.isAdminLoggedIn) {
        router.push('/admin-login');
        return;
      }
    } catch (error) {
      console.error('Error checking admin auth status:', error);
      router.push('/admin-login');
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleAdminLogout = async () => {
    try {
      await fetch('/api/auth/admin/logout', { method: 'POST' });
      router.push('/admin-login');
    } catch (error) {
      console.error('Error logging out admin:', error);
    }
  };

  const handleTestEmail = async () => {
    try {
      const response = await fetch('/api/auth/admin/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const result = await response.json();

      if (response.ok) {
        alert(`✅ Email testowy wysłany na: ${result.sentTo}\nKod testowy: ${result.testCode}`);
      } else {
        alert(`❌ Błąd wysyłania emaila: ${result.error}\n${result.details || ''}`);
      }
    } catch (error) {
      console.error('Error testing email:', error);
      alert('❌ Błąd połączenia z serwerem');
    }
  };

  const handleAction = async (email: string, action: 'approve' | 'reject') => {
    setProcessing(email);
    try {
      const response = await fetch('/api/auth/admin/manage-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, action }),
      });

      if (response.ok) {
        await fetchData(); // Odśwież dane
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error processing action:', error);
      alert('Error processing request');
    } finally {
      setProcessing(null);
    }
  };

  if (checkingAuth) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontFamily: 'Arial, sans-serif' 
      }}>
        <div>Sprawdzanie autoryzacji administratora...</div>
      </div>
    );
  }

  if (!authStatus?.isAdminLoggedIn) {
    return null; // Przekierowanie w toku
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div>Ładowanie...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Panel Administracyjny - AutoGallery</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      
      <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '2px solid #f44336',
          paddingBottom: '10px'
        }}>
          <h1 style={{ margin: 0, color: '#f44336' }}>👑 Panel Administracyjny</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ fontSize: '14px', color: '#666' }}>
              Zalogowany: <strong>{authStatus.email}</strong>
            </span>
            <button
              onClick={handleTestEmail}
              style={{
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                padding: '8px 15px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                marginRight: '10px'
              }}
            >
              Test Email
            </button>
            <button
              onClick={handleAdminLogout}
              style={{
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                padding: '8px 15px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Wyloguj admina
            </button>
          </div>
        </div>
        
        {/* Oczekujące wnioski */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ color: '#333', borderBottom: '2px solid #ddd', paddingBottom: '10px' }}>
            Oczekujące wnioski ({data.pending.length})
          </h2>
          
          {data.pending.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Brak oczekujących wniosków</p>
          ) : (
            <div style={{ display: 'grid', gap: '15px' }}>
              {data.pending.map((request) => (
                <div 
                  key={request.email} 
                  style={{ 
                    background: '#f9f9f9', 
                    padding: '15px', 
                    borderRadius: '8px',
                    border: '1px solid #ddd'
                  }}
                >
                  <div style={{ marginBottom: '10px' }}>
                    <strong>Email:</strong> {request.email}
                  </div>
                  <div style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>
                    <strong>IP:</strong> {request.ip} | 
                    <strong> Data:</strong> {new Date(request.timestamp).toLocaleString('pl-PL')}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => handleAction(request.email, 'approve')}
                      disabled={processing === request.email}
                      style={{
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '4px',
                        cursor: processing === request.email ? 'not-allowed' : 'pointer',
                        opacity: processing === request.email ? 0.6 : 1
                      }}
                    >
                      {processing === request.email ? 'Przetwarzanie...' : 'Zatwierdź'}
                    </button>
                    
                    <button
                      onClick={() => handleAction(request.email, 'reject')}
                      disabled={processing === request.email}
                      style={{
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '4px',
                        cursor: processing === request.email ? 'not-allowed' : 'pointer',
                        opacity: processing === request.email ? 0.6 : 1
                      }}
                    >
                      {processing === request.email ? 'Przetwarzanie...' : 'Odrzuć'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Biała lista */}
        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ color: '#4CAF50', borderBottom: '2px solid #ddd', paddingBottom: '10px' }}>
            Biała lista ({data.whitelist.length})
          </h2>
          
          {data.whitelist.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Brak emaili na białej liście</p>
          ) : (
            <div style={{ display: 'grid', gap: '5px' }}>
              {data.whitelist.map((email) => (
                <div 
                  key={email}
                  style={{ 
                    background: '#e8f5e8', 
                    padding: '8px 12px', 
                    borderRadius: '4px',
                    border: '1px solid #4CAF50'
                  }}
                >
                  {email}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Czarna lista */}
        <section>
          <h2 style={{ color: '#f44336', borderBottom: '2px solid #ddd', paddingBottom: '10px' }}>
            Czarna lista ({data.blacklist.length})
          </h2>
          
          {data.blacklist.length === 0 ? (
            <p style={{ color: '#666', fontStyle: 'italic' }}>Brak emaili na czarnej liście</p>
          ) : (
            <div style={{ display: 'grid', gap: '5px' }}>
              {data.blacklist.map((email) => (
                <div 
                  key={email}
                  style={{ 
                    background: '#fdeaea', 
                    padding: '8px 12px', 
                    borderRadius: '4px',
                    border: '1px solid #f44336'
                  }}
                >
                  {email}
                </div>
              ))}
            </div>
          )}
        </section>

        <div style={{ marginTop: '40px', textAlign: 'center' }}>
          <button 
            onClick={fetchData}
            style={{
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Odśwież dane
          </button>
        </div>
      </div>
    </>
  );
};

export default AdminPanel;

export async function getServerSideProps() {
  return {
    props: {},
  };
}
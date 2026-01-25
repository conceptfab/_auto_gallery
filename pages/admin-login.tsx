import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const AdminLoginPage: React.FC = () => {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [emergencyMode, setEmergencyMode] = useState(false);

  useEffect(() => {
    checkIfAlreadyLoggedIn();
  }, []);

  const checkIfAlreadyLoggedIn = async () => {
    try {
      const response = await fetch('/api/auth/admin/status');
      const result = await response.json();
      
      if (result.isAdminLoggedIn) {
        router.push('/admin');
      }
    } catch (error) {
      console.error('Error checking admin auth status:', error);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/auth/admin/request-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (response.ok) {
        if (result.emergencyMode) {
          setEmergencyMode(true);
          setMessage('Serwer email niedostępny. Użyj kodu awaryjnego MASTER123');
        } else {
          setMessage('Kod dostępu został wysłany na Twój email administratora.');
        }
        setStep('code');
      } else {
        setError(result.error || 'Wystąpił błąd');
      }
    } catch (error) {
      setError('Błąd połączenia z serwerem');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/admin/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, code }),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage('Logowanie administratora pomyślne! Przekierowywanie...');
        setTimeout(() => {
          router.push('/admin');
        }, 1500);
      } else {
        setError(result.error || 'Wystąpił błąd');
      }
    } catch (error) {
      setError('Błąd połączenia z serwerem');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Panel Administratora - Logowanie</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{
          background: 'white',
          padding: '40px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '400px',
          border: '3px solid #f44336'
        }}>
          <h1 style={{ 
            textAlign: 'center', 
            marginBottom: '10px',
            color: '#f44336'
          }}>
            👑 Panel Administratora
          </h1>
          
          <p style={{
            textAlign: 'center',
            marginBottom: '30px',
            fontSize: '14px',
            color: '#666'
          }}>
            Dostęp tylko dla administratora
          </p>

          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit}>
              <h2 style={{ marginBottom: '20px', color: '#555' }}>Autoryzacja administratora</h2>
              
              <p style={{ 
                marginBottom: '30px', 
                color: '#666', 
                textAlign: 'center',
                fontSize: '14px' 
              }}>
                Kliknij aby otrzymać kod dostępu na email administratora.
              </p>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '15px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  fontWeight: 'bold'
                }}
              >
                {loading ? 'Wysyłanie...' : 'Wyślij kod dostępu'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit}>
              <h2 style={{ marginBottom: '20px', color: '#555' }}>Wprowadź kod z emaila</h2>
              
              {emergencyMode && (
                <div style={{
                  marginBottom: '15px',
                  padding: '10px',
                  backgroundColor: '#fff3cd',
                  border: '1px solid #ffeaa7',
                  borderRadius: '4px',
                  fontSize: '14px',
                  color: '#856404'
                }}>
                  <strong>⚠️ Tryb awaryjny:</strong> Użyj kodu <strong>MASTER123</strong>
                </div>
              )}
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#666' }}>
                  Kod dostępu administratora:
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                  maxLength={9}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '20px',
                    letterSpacing: '4px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    boxSizing: 'border-box'
                  }}
                  placeholder="ABC123"
                />
              </div>

              <button
                type="submit"
                disabled={loading || (code.length < 6)}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '16px',
                  cursor: (loading || code.length < 6) ? 'not-allowed' : 'pointer',
                  opacity: (loading || code.length < 6) ? 0.6 : 1
                }}
              >
                {loading ? 'Weryfikacja...' : 'Zaloguj jako admin'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError('');
                  setMessage('');
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: 'transparent',
                  color: '#666',
                  border: 'none',
                  fontSize: '14px',
                  cursor: 'pointer',
                  marginTop: '10px',
                  textDecoration: 'underline'
                }}
              >
                Wyślij kod ponownie
              </button>
            </form>
          )}

          {message && (
            <div style={{
              marginTop: '20px',
              padding: '12px',
              backgroundColor: '#e8f5e8',
              border: '1px solid #4CAF50',
              borderRadius: '4px',
              color: '#2e7d32',
              fontSize: '14px'
            }}>
              {message}
            </div>
          )}

          {error && (
            <div style={{
              marginTop: '20px',
              padding: '12px',
              backgroundColor: '#fdeaea',
              border: '1px solid #f44336',
              borderRadius: '4px',
              color: '#c62828',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AdminLoginPage;

// Disable static generation to avoid router issues  
export async function getServerSideProps() {
  return {
    props: {},
  };
}
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const AdminLoginPage: React.FC = () => {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, _setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [emergencyMode, setEmergencyMode] = useState(false);

  useEffect(() => {
    checkIfAlreadyLoggedIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const checkIfAlreadyLoggedIn = async () => {
    try {
      const response = await fetch('/api/auth/admin/status');
      const result = await response.json();

      if (result.isAdminLoggedIn) {
        router.push('/admin');
      }
    } catch (err) {
      console.error('Error checking admin auth status:', err);
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
          setMessage(
            'Serwer email niedostępny. Skontaktuj się z administratorem systemu.',
          );
        } else {
          setMessage(
            'Kod dostępu został wysłany na Twój email administratora.',
          );
        }
        setStep('code');
      } else {
        setError(result.error || 'Wystąpił błąd');
      }
    } catch (_error) {
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
    } catch (_error) {
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

      <div className="login-container">
        <div className="login-box admin-login-box">
          <h1 className="admin-login-title">👑 Panel Administratora</h1>

          <p className="login-msg">Dostęp tylko dla administratora</p>

          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit}>
              <h2 className="login-form-title">Autoryzacja administratora</h2>

              <p className="login-msg login-msg--centered">
                Kliknij aby otrzymać kod dostępu na email administratora.
              </p>

              <button
                type="submit"
                disabled={loading}
                className="login-btn login-btn--danger login-btn--large"
              >
                {loading ? 'Wysyłanie...' : 'Wyślij kod dostępu'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit}>
              <h2 className="login-form-title">Wprowadź kod z emaila</h2>

              {emergencyMode && (
                <div className="login-msg--warning">
                  <strong>⚠️ Tryb awaryjny:</strong> Skontaktuj się z
                  administratorem systemu w celu uzyskania kodu dostępu.
                </div>
              )}

              <div className="login-field">
                <label className="login-label">
                  Kod dostępu administratora:
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                  maxLength={9}
                  className="login-input login-input--code"
                  placeholder="ABC123"
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="login-btn login-btn--danger"
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
                className="login-btn login-btn--secondary"
                style={{ marginTop: '10px', textDecoration: 'underline' }}
              >
                Wyślij kod ponownie
              </button>
            </form>
          )}

          {message && (
            <div className="login-message login-message--success">
              {message}
            </div>
          )}

          {error && (
            <div className="login-message login-message--error">{error}</div>
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

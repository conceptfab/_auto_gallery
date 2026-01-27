import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const LoginPage: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    checkIfAlreadyLoggedIn();
  }, []);

  const checkIfAlreadyLoggedIn = async () => {
    try {
      const response = await fetch('/api/auth/status');
      const result = await response.json();

      if (result.isLoggedIn) {
        router.push('/');
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  };
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(
          'Wniosek został wysłany do administratora. Sprawdź swoją skrzynkę email po otrzymaniu zatwierdzenia.',
        );
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
      const response = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, code }),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage('Logowanie pomyślne! Przekierowywanie...');
        setTimeout(() => {
          router.push('/');
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
        <title>Logowanie - Content Browser</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="login-container">
        <div className="login-box">
          <h1 className="login-title">Content Browser</h1>

          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit}>
              <h2 className="login-form-title">Wprowadź swój email</h2>

              <div className="login-field">
                <label className="login-label">Adres email:</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="login-input"
                  placeholder="twoj.email@example.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="login-btn login-btn--primary"
              >
                {loading ? 'Wysyłanie...' : 'Wyślij email'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit}>
              <h2 className="login-form-title">Wprowadź kod z emaila</h2>

              <div className="login-field login-field--sm">
                Email: <strong>{email}</strong>
              </div>

              <div className="login-field">
                <label className="login-label">Kod dostępu (6 znaków):</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  required
                  maxLength={6}
                  className="login-input login-input--code"
                  placeholder="ABC123"
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="login-btn login-btn--success"
              >
                {loading ? 'Weryfikacja...' : 'Zaloguj się'}
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
                Zmień adres email
              </button>
            </form>
          )}

          {message && (
            <div
              style={{
                marginTop: '20px',
                padding: '12px',
                backgroundColor: '#e8f5e8',
                border: '1px solid #4CAF50',
                borderRadius: '4px',
                color: '#2e7d32',
                fontSize: '14px',
              }}
            >
              {message}
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: '20px',
                padding: '12px',
                backgroundColor: '#fdeaea',
                border: '1px solid #f44336',
                borderRadius: '4px',
                color: '#c62828',
                fontSize: '14px',
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              marginTop: '30px',
              padding: '15px',
              backgroundColor: '#f9f9f9',
              borderRadius: '4px',
              fontSize: '14px',
              color: '#666',
            }}
          >
            <strong>Jak to działa:</strong>
            <ol style={{ margin: '10px 0 0 20px', padding: 0 }}>
              <li>Wprowadź swój adres email</li>
              <li>
                Administrator otrzyma powiadomienie i zatwierdzi Twój dostęp
              </li>
              <li>Otrzymasz kod na email (ważny 15 minut)</li>
              <li>Wprowadź kod aby się zalogować</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;

// Disable static generation to avoid router issues
export async function getServerSideProps() {
  return {
    props: {},
  };
}

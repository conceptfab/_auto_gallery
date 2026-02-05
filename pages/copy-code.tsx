import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

const CopyCodePage: React.FC = () => {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    const c = router.query.code;
    if (typeof c === 'string' && /^[A-Z0-9]{6}$/.test(c)) {
      setCode(c);
      navigator.clipboard.writeText(c).then(() => setCopied(true)).catch(() => {});
    }
  }, [router.query.code]);

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // fallback: select text
    }
  };

  return (
    <>
      <Head>
        <title>Kod dostępu - Content Browser</title>
      </Head>
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Inter, sans-serif',
          background: '#f5f5f5',
        }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '40px',
            textAlign: 'center',
            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
            maxWidth: '400px',
            width: '100%',
          }}
        >
          {code ? (
            <>
              <h2 style={{ margin: '0 0 8px', fontSize: '18px', color: '#333' }}>
                Twój kod dostępu
              </h2>
              <div
                style={{
                  background: '#f4f4f4',
                  borderRadius: '8px',
                  padding: '20px',
                  margin: '16px 0',
                  fontSize: '32px',
                  fontWeight: 700,
                  letterSpacing: '8px',
                  color: '#333',
                  userSelect: 'all',
                }}
              >
                {code}
              </div>
              {copied ? (
                <p style={{ color: '#4CAF50', fontWeight: 600, fontSize: '15px' }}>
                  Skopiowano do schowka!
                </p>
              ) : (
                <button
                  onClick={handleCopy}
                  style={{
                    background: '#333',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 28px',
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Kopiuj kod
                </button>
              )}
              <p style={{ marginTop: '20px', fontSize: '13px', color: '#999' }}>
                Wklej kod na stronie logowania
              </p>
              <Link
                href="/login"
                style={{
                  display: 'inline-block',
                  marginTop: '8px',
                  color: '#2196F3',
                  fontSize: '14px',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                Przejdź do logowania &rarr;
              </Link>
            </>
          ) : (
            <p style={{ color: '#999' }}>Brak kodu w linku.</p>
          )}
        </div>
      </div>
    </>
  );
};

export default CopyCodePage;

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import { logger } from '../utils/logger';
import { useNotification } from './GlobalNotification';

const BUG_MAX_ATTACHMENTS = 5;
const BUG_MAX_SIZE_BYTES = 1024 * 1024; // 1 MB

interface TopMenuBarProps {
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

const TopMenuBar: React.FC<TopMenuBarProps> = ({ clientName }) => {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [cacheStatus, setCacheStatus] = useState<CacheStatusInfo | null>(null);
  const [showBugForm, setShowBugForm] = useState(false);
  const [bugReport, setBugReport] = useState({ subject: '', message: '' });
  const [bugAttachments, setBugAttachments] = useState<File[]>([]);
  const [sendingBug, setSendingBug] = useState(false);
  const bugFileInputRef = useRef<HTMLInputElement>(null);
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
      // Użyj publicznego endpointu dostępnego dla wszystkich użytkowników
      const response = await fetch('/api/cache/status-public');
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCacheStatus({
            enabled: data.cacheWorking,
            thumbnailsCount: data.thumbnailsCount || 0,
            filesCount: data.filesMonitored || 0,
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

  const addBugAttachments = (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...bugAttachments];
    for (
      let i = 0;
      i < files.length && next.length < BUG_MAX_ATTACHMENTS;
      i++
    ) {
      const f = files[i];
      if (f.size > BUG_MAX_SIZE_BYTES) {
        showError(`Plik "${f.name}" przekracza 1 MB`, 'Błąd');
        continue;
      }
      next.push(f);
    }
    if (next.length > BUG_MAX_ATTACHMENTS) {
      showError(`Maksymalnie ${BUG_MAX_ATTACHMENTS} załączników`, 'Błąd');
      next.splice(BUG_MAX_ATTACHMENTS);
    }
    setBugAttachments(next);
    if (bugFileInputRef.current) bugFileInputRef.current.value = '';
  };

  const removeBugAttachment = (index: number) => {
    setBugAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = (r.result as string) ?? '';
        const base64 = s.includes(',') ? s.split(',')[1] : s;
        resolve(base64 ?? '');
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const handleSendBugReport = async () => {
    if (!bugReport.subject.trim() || !bugReport.message.trim()) {
      showError('Wypełnij temat i opis', 'Błąd');
      return;
    }
    setSendingBug(true);
    try {
      const attachments =
        bugAttachments.length > 0
          ? await Promise.all(
              bugAttachments.map(async (f) => ({
                filename: f.name,
                content: await fileToBase64(f),
              }))
            )
          : undefined;

      const response = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: bugReport.subject,
          message: bugReport.message,
          userEmail: authStatus?.email || 'anonymous',
          page: router.pathname,
          version: versionInfo?.message ?? '',
          attachments,
        }),
      });

      const data = response.ok ? null : await response.json().catch(() => ({}));
      if (response.ok) {
        showSuccess('Zgłoszenie wysłane');
        setShowBugForm(false);
        setBugReport({ subject: '', message: '' });
        setBugAttachments([]);
      } else {
        showError(
          typeof data?.error === 'string' ? data.error : 'Błąd wysyłania',
          'Błąd'
        );
      }
    } catch (error) {
      logger.error('Error sending bug report', error);
      showError('Błąd wysyłania', 'Błąd');
    } finally {
      setSendingBug(false);
    }
  };

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
                ver:{' '}
                {versionInfo?.message?.split(':')[0] ??
                  versionInfo?.message ??
                  ''}
                {versionInfo?.date ? ` ${versionInfo.date}` : ''}
              </span>
            </h1>
          </div>
          <button
            type="button"
            onClick={() => router.push('/')}
            title="Content"
            className="top-menu-bar-nav-btn"
          >
            Content
          </button>
          <button
            type="button"
            onClick={() => router.push('/design')}
            title="Design"
            className="top-menu-bar-nav-btn"
          >
            Design
          </button>
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
                backgroundColor: 'transparent',
                marginRight: '4px',
              }}
            >
              <i
                className="las la-database"
                style={{
                  color:
                    cacheStatus.thumbnailsCount > 0 ? '#111827' : '#d1d5db',
                  opacity: cacheStatus.thumbnailsCount > 0 ? 1 : 0.4,
                }}
              ></i>
            </div>
          )}
          {/* Bug report button */}
          <button
            onClick={() => setShowBugForm(true)}
            title="Zgłoś błąd"
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              padding: '6px',
              cursor: 'pointer',
              fontSize: '22px',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className="las la-bug" style={{ color: '#6b7280' }}></i>
          </button>
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

      {/* Bug report modal – portal do body, żeby fixed centrował się na ekranie (backdrop-filter w nav zmienia containing block) */}
      {showBugForm &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
            }}
            onClick={() => setShowBugForm(false)}
          >
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '24px',
                width: '100%',
                maxWidth: '400px',
                margin: '16px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '16px', color: '#111827' }}>
                  <i
                    className="las la-bug"
                    style={{ marginRight: '8px', color: '#6b7280' }}
                  ></i>
                  Zgłoś błąd
                </h3>
                <button
                  onClick={() => setShowBugForm(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '20px',
                    color: '#6b7280',
                  }}
                >
                  <i className="las la-times"></i>
                </button>
              </div>
              <input
                type="text"
                placeholder="Temat"
                value={bugReport.subject}
                onChange={(e) =>
                  setBugReport({ ...bugReport, subject: e.target.value })
                }
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  marginBottom: '12px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
              <textarea
                placeholder="Opisz problem..."
                value={bugReport.message}
                onChange={(e) =>
                  setBugReport({ ...bugReport, message: e.target.value })
                }
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  marginBottom: '12px',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
              {/* Załączniki: max 5 szt., 1 MB każdy */}
              <div style={{ marginBottom: '16px' }}>
                <input
                  ref={bugFileInputRef}
                  type="file"
                  multiple
                  accept="*/*"
                  onChange={(e) => {
                    addBugAttachments(e.target.files);
                    e.target.value = '';
                  }}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => bugFileInputRef.current?.click()}
                  disabled={bugAttachments.length >= BUG_MAX_ATTACHMENTS}
                  style={{
                    padding: '6px 12px',
                    border: '1px dashed #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: '#f9fafb',
                    cursor:
                      bugAttachments.length >= BUG_MAX_ATTACHMENTS
                        ? 'not-allowed'
                        : 'pointer',
                    fontSize: '13px',
                    color: '#6b7280',
                  }}
                >
                  <i
                    className="las la-paperclip"
                    style={{ marginRight: '6px' }}
                  ></i>
                  Dodaj załącznik ({bugAttachments.length}/{BUG_MAX_ATTACHMENTS}
                  , max 1 MB)
                </button>
                {bugAttachments.length > 0 && (
                  <ul
                    style={{
                      margin: '8px 0 0 0',
                      padding: 0,
                      listStyle: 'none',
                      fontSize: '13px',
                    }}
                  >
                    {bugAttachments.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 0',
                          borderBottom: '1px solid #f3f4f6',
                        }}
                      >
                        <span
                          style={{
                            color: '#374151',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '220px',
                          }}
                          title={f.name}
                        >
                          {f.name} ({(f.size / 1024).toFixed(1)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={() => removeBugAttachment(i)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px 6px',
                            color: '#6b7280',
                            fontSize: '16px',
                          }}
                          title="Usuń"
                        >
                          <i className="las la-times"></i>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  onClick={() => setShowBugForm(false)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Anuluj
                </button>
                <button
                  onClick={handleSendBugReport}
                  disabled={sendingBug}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: '#7c3aed',
                    color: 'white',
                    cursor: sendingBug ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    opacity: sendingBug ? 0.7 : 1,
                  }}
                >
                  {sendingBug ? 'Wysyłanie...' : 'Wyślij'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </nav>
  );
};

export default TopMenuBar;

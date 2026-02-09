import React, { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import FileManager from '../src/components/FileManager';
import LoadingOverlay from '../src/components/LoadingOverlay';
import { PendingRequestsSection } from '../src/components/admin/PendingRequestsSection';
import { DashboardStats } from '../src/components/admin/DashboardStats';
import { DesignStatsSection } from '../src/components/admin/DesignStatsSection';
import { UserLists } from '../src/components/admin/UserLists';
import { GroupsManager } from '../src/components/admin/GroupsManager';
import { CacheMonitorSection } from '../src/components/admin/CacheMonitorSection';
import { VolumeBrowserSection } from '../src/components/admin/VolumeBrowserSection';
import { DataStorageSection } from '../src/components/admin/DataStorageSection';
import { ProjectsSection } from '../src/components/admin/ProjectsSection';
import { MoodboardDrawingConfigSection } from '../src/components/admin/MoodboardDrawingConfigSection';
import { useAdminData } from '../src/hooks/useAdminData';
import { useAdminGroups } from '../src/hooks/useAdminGroups';
import { useAdminSettings } from '../src/hooks/useAdminSettings';
import type { AdminAuthStatus } from '../src/types/admin';
import { logger } from '../src/utils/logger';
import { formatBytes } from '../src/utils/formatBytes';

type AdminTab = 'overview' | 'users' | 'settings' | 'files' | 'data' | 'moodboard';

const ADMIN_TABS: { id: AdminTab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Przegląd', icon: 'la-chart-bar' },
  { id: 'users', label: 'Użytkownicy', icon: 'la-users' },
  { id: 'settings', label: 'Ustawienia', icon: 'la-cog' },
  { id: 'files', label: 'Pliki', icon: 'la-folder-open' },
  { id: 'data', label: 'Dane', icon: 'la-database' },
  { id: 'moodboard', label: 'Moodboardy', icon: 'la-palette' },
];

const AdminPanel: React.FC = () => {
  const router = useRouter();
  const { data, loading, setLoading, fetchData } = useAdminData();
  const { groups, folderStatus, fetchGroups } = useAdminGroups();
  const { settings, setSettings, fetchSettings, updateSettings } =
    useAdminSettings();

  const [processing, setProcessing] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  const [cleanupProcessing, setCleanupProcessing] = useState(false);
  const [lastCleanupResult, setLastCleanupResult] = useState<{
    deletedLogins: number;
    deletedSessions: number;
    deletedViews: number;
    deletedDownloads: number;
  } | null>(null);

  // Orphaned files cleanup
  const [orphanedFilesScanning, setOrphanedFilesScanning] = useState(false);
  const [orphanedFilesDeleting, setOrphanedFilesDeleting] = useState(false);
  const [orphanedFilesScanResult, setOrphanedFilesScanResult] = useState<{
    orphanedFiles: { path: string; type: string; size: number }[];
    totalSize: number;
    scannedRevisionThumbnails: number;
    scannedGalleryFiles: number;
    scannedMoodboardFiles: number;
  } | null>(null);
  const [orphanedFilesDeleteResult, setOrphanedFilesDeleteResult] = useState<{
    deleted: number;
    freedBytes: number;
  } | null>(null);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set([
      'stats',
      'design-stats',
      'whitelist',
      'blacklist',
      'groups',
      'projects',
      'settings',
      'data-cleanup',
      'cache',
      'files',
      'volume',
      'data-storage',
      'moodboard-drawing',
    ])
  );

  const [newWhitelistEmail, setNewWhitelistEmail] = useState('');
  const [newBlacklistEmail, setNewBlacklistEmail] = useState('');

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const unassignedUsers = useMemo(() => {
    const assigned = new Set(groups.flatMap((g) => g.users));
    return data.whitelist.filter((email) => !assigned.has(email));
  }, [groups, data.whitelist]);

  useEffect(() => {
    checkAdminAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    if (authStatus?.isAdminLoggedIn) {
      setLoading(true);
      fetchData();
      fetchGroups();
      fetchSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- authStatus is the intended trigger
  }, [authStatus]);

  const refreshAll = () => {
    fetchData();
    fetchGroups();
  };

  const handleScanOrphanedFiles = async () => {
    setOrphanedFilesScanning(true);
    setOrphanedFilesScanResult(null);
    setOrphanedFilesDeleteResult(null);
    try {
      const res = await fetch('/api/admin/cleanup-orphaned-files', {
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = await res.json();
        setOrphanedFilesScanResult(data);
      }
    } catch (err) {
      logger.error('Scan orphaned files error:', err);
    } finally {
      setOrphanedFilesScanning(false);
    }
  };

  const handleDeleteOrphanedFiles = async () => {
    if (
      !orphanedFilesScanResult ||
      orphanedFilesScanResult.orphanedFiles.length === 0
    )
      return;
    if (
      !confirm(
        `Czy na pewno chcesz usunąć ${orphanedFilesScanResult.orphanedFiles.length} osieroconych plików? Ta operacja jest nieodwracalna.`
      )
    ) {
      return;
    }
    setOrphanedFilesDeleting(true);
    try {
      const res = await fetch('/api/admin/cleanup-orphaned-files', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = await res.json();
        setOrphanedFilesDeleteResult(data);
        setOrphanedFilesScanResult(null);
      }
    } catch (err) {
      logger.error('Delete orphaned files error:', err);
    } finally {
      setOrphanedFilesDeleting(false);
    }
  };

  const handleManualCleanup = async () => {
    if (
      !confirm(
        `Czy na pewno chcesz usunąć dane starsze niż ${settings.autoCleanupDays} dni? Ta operacja jest nieodwracalna.`
      )
    ) {
      return;
    }

    setCleanupProcessing(true);
    setLastCleanupResult(null);
    try {
      const response = await fetch('/api/admin/stats/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysToKeep: settings.autoCleanupDays }),
      });
      const result = await response.json();
      if (result.success) {
        setLastCleanupResult(result.deleted);
      } else {
        alert(`Błąd: ${result.error}`);
      }
    } catch (error) {
      logger.error('Error during manual cleanup', error);
      alert('Błąd podczas czyszczenia danych');
    } finally {
      setCleanupProcessing(false);
    }
  };

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
      logger.error('Error checking admin auth status', error);
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
      logger.error('Error logging out admin', error);
    }
  };

  const handlePendingEmailAction = async (
    email: string,
    action: 'approve' | 'reject'
  ) => {
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
        await fetchData();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      logger.error('Error processing action', error);
      alert('Error processing request');
    } finally {
      setProcessing(null);
    }
  };

  const handleRemoveFromList = async (
    email: string,
    listType: 'whitelist' | 'blacklist'
  ) => {
    if (
      !confirm(
        `Czy na pewno chcesz usunąć ${email} z ${
          listType === 'whitelist' ? 'białej' : 'czarnej'
        } listy?`
      )
    ) {
      return;
    }

    setProcessing(email);
    try {
      const response = await fetch('/api/auth/admin/remove-from-list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, listType }),
      });

      if (response.ok) {
        await fetchData();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      logger.error('Error removing email from list', error);
      alert('Error removing email');
    } finally {
      setProcessing(null);
    }
  };

  const handleAddToList = async (
    email: string,
    listType: 'whitelist' | 'blacklist'
  ) => {
    if (!email || !email.trim()) {
      alert('Proszę podać adres email');
      return;
    }

    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!EMAIL_REGEX.test(email.trim())) {
      alert('Nieprawidłowy adres email');
      return;
    }

    setProcessing(`add-${listType}-${email}`);
    try {
      const response = await fetch('/api/auth/admin/add-to-list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim(), listType }),
      });

      if (response.ok) {
        await fetchData();
        if (listType === 'whitelist') {
          setNewWhitelistEmail('');
        } else {
          setNewBlacklistEmail('');
        }
      } else {
        const error = await response.json();
        alert(`Błąd: ${error.error}`);
      }
    } catch (error) {
      logger.error('Error adding email to list', error);
      alert('Błąd podczas dodawania emaila');
    } finally {
      setProcessing(null);
    }
  };

  if (checkingAuth) {
    return (
      <LoadingOverlay message="Sprawdzanie autoryzacji administratora..." />
    );
  }

  if (!authStatus?.isAdminLoggedIn) {
    return null;
  }

  if (loading) {
    return <LoadingOverlay message="Ładowanie..." />;
  }

  return (
    <>
      <Head>
        <title>Panel Administracyjny - ConceptDesk</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="admin-page">
        <div className="admin-header">
          <h1 className="admin-header-title">Panel administracyjny</h1>
          <div className="admin-header-actions">
            <button
              onClick={refreshAll}
              type="button"
              className="admin-btn"
              title="Odśwież dane"
            >
              <i className="las la-sync" style={{ marginRight: '6px' }}></i>
              Odśwież
            </button>
            <span className="admin-header-user">
              <strong>{authStatus.email}</strong>
            </span>
            <button
              onClick={handleAdminLogout}
              type="button"
              className="admin-btn admin-btn--danger"
            >
              Wyloguj
            </button>
          </div>
        </div>

        {/* Pending requests - always visible when there are items */}
        {data.pending.length > 0 && (
          <PendingRequestsSection
            pending={data.pending}
            processing={processing}
            onAction={handlePendingEmailAction}
          />
        )}

        {/* Tab bar */}
        <div className="admin-tabs">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`admin-tab ${
                activeTab === tab.id ? 'admin-tab--active' : ''
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <i className={`las ${tab.icon}`}></i>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Przegląd */}
        {activeTab === 'overview' && (
          <>
            <DashboardStats
              isExpanded={expandedSections.has('stats')}
              onToggleSection={() => toggleSection('stats')}
            />

            <section className="admin-section">
              <h2
                className="admin-section-title admin-section-title-clickable"
                onClick={() => toggleSection('design-stats')}
              >
                <span>Statystyki Design</span>
                <i
                  className={`las la-angle-up admin-section-toggle ${
                    expandedSections.has('design-stats') ? '' : 'collapsed'
                  }`}
                />
              </h2>
              {expandedSections.has('design-stats') && <DesignStatsSection />}
            </section>

            <ProjectsSection
              isExpanded={expandedSections.has('projects')}
              onToggleSection={() => toggleSection('projects')}
              groups={groups}
              onGroupsChange={fetchGroups}
            />
          </>
        )}

        {/* Tab: Użytkownicy */}
        {activeTab === 'users' && (
          <>
            <UserLists
              whitelist={data.whitelist}
              blacklist={data.blacklist}
              newWhitelistEmail={newWhitelistEmail}
              newBlacklistEmail={newBlacklistEmail}
              processing={processing}
              expandedSections={expandedSections}
              onToggleSection={toggleSection}
              onWhitelistEmailChange={setNewWhitelistEmail}
              onBlacklistEmailChange={setNewBlacklistEmail}
              onAddToList={handleAddToList}
              onRemoveFromList={handleRemoveFromList}
            />

            <GroupsManager
              groups={groups}
              folderStatus={folderStatus}
              unassignedUsers={unassignedUsers}
              processing={processing}
              setProcessing={setProcessing}
              isExpanded={expandedSections.has('groups')}
              onToggleSection={() => toggleSection('groups')}
              onGroupsChange={fetchGroups}
            />
          </>
        )}

        {/* Tab: Ustawienia */}
        {activeTab === 'settings' && (
          <>
            {/* Ustawienia UI/UX */}
            <section className="admin-section">
              <h2
                className="admin-section-title admin-section-title-clickable"
                onClick={() => toggleSection('settings')}
              >
                <span>Ustawienia UI/UX</span>
                <i
                  className={`las la-angle-up admin-section-toggle ${
                    expandedSections.has('settings') ? '' : 'collapsed'
                  }`}
                ></i>
              </h2>

              {expandedSections.has('settings') && (
                <>
                  <div className="admin-form-box">
                    <h3>Kolorowanie słów kluczowych</h3>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                        Włącz/wyłącz kolorowanie słów kluczowych w nazwach
                        plików
                      </p>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={settings.highlightKeywords}
                          onChange={(e) => {
                            updateSettings({
                              highlightKeywords: e.target.checked,
                            });
                          }}
                          style={{
                            width: '20px',
                            height: '20px',
                            cursor: 'pointer',
                          }}
                        />
                        <span style={{ fontSize: '14px', fontWeight: 500 }}>
                          {settings.highlightKeywords
                            ? 'Włączone'
                            : 'Wyłączone'}
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="admin-form-box">
                    <h3>Opóźnienie animacji miniaturek</h3>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                        Czas opóźnienia między pojawianiem się kolejnych
                        miniaturek (0–1000 ms)
                      </p>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <input
                          type="range"
                          min="0"
                          max="1000"
                          step="5"
                          value={settings.thumbnailAnimationDelay}
                          onChange={(e) => {
                            const value = parseInt(e.target.value, 10);
                            setSettings((prev) => ({
                              ...prev,
                              thumbnailAnimationDelay: value,
                            }));
                          }}
                          onMouseUp={(e) => {
                            const value = parseInt(
                              (e.target as HTMLInputElement).value,
                              10
                            );
                            updateSettings({ thumbnailAnimationDelay: value });
                          }}
                          onTouchEnd={(e) => {
                            const value = parseInt(
                              (e.target as HTMLInputElement).value,
                              10
                            );
                            updateSettings({ thumbnailAnimationDelay: value });
                          }}
                          style={{
                            width: '120px',
                            cursor: 'pointer',
                          }}
                        />
                        <span
                          style={{
                            fontSize: '14px',
                            fontWeight: 500,
                            minWidth: '50px',
                          }}
                        >
                          {settings.thumbnailAnimationDelay} ms
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="admin-form-box">
                    <h3>Czas trwania sesji (cookies)</h3>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                        Jak długo ciasteczka utrzymują zalogowanie użytkownika
                      </p>
                      <select
                        value={settings.sessionDurationHours}
                        onChange={(e) => {
                          const value = parseInt(e.target.value, 10);
                          updateSettings({ sessionDurationHours: value });
                        }}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #ccc',
                          fontSize: '14px',
                          cursor: 'pointer',
                          minWidth: '120px',
                        }}
                      >
                        <option value={12}>12 godzin</option>
                        <option value={24}>1 dzień</option>
                        <option value={48}>2 dni</option>
                        <option value={72}>3 dni</option>
                        <option value={168}>7 dni</option>
                        <option value={336}>14 dni</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
            </section>

            {/* Czyszczenie danych */}
            <section className="admin-section">
              <h2
                className="admin-section-title admin-section-title-clickable"
                onClick={() => toggleSection('data-cleanup')}
              >
                <span>Czyszczenie danych</span>
                <i
                  className={`las la-angle-up admin-section-toggle ${
                    expandedSections.has('data-cleanup') ? '' : 'collapsed'
                  }`}
                ></i>
              </h2>

              {expandedSections.has('data-cleanup') && (
                <div className="admin-form-box">
                  <h3>Automatyczne czyszczenie historii</h3>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '16px',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                      Automatycznie usuwaj dane (logowania, sesje, wyświetlenia,
                      pobrania) starsze niż określona liczba dni
                    </p>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={settings.autoCleanupEnabled}
                        onChange={(e) => {
                          updateSettings({
                            autoCleanupEnabled: e.target.checked,
                          });
                        }}
                        style={{
                          width: '20px',
                          height: '20px',
                          cursor: 'pointer',
                        }}
                      />
                      <span style={{ fontSize: '14px', fontWeight: 500 }}>
                        {settings.autoCleanupEnabled ? 'Włączone' : 'Wyłączone'}
                      </span>
                    </label>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '15px',
                      marginBottom: '20px',
                    }}
                  >
                    <label style={{ fontSize: '14px', color: '#333' }}>
                      Usuwaj dane starsze niż:
                    </label>
                    <select
                      value={settings.autoCleanupDays}
                      onChange={(e) => {
                        updateSettings({
                          autoCleanupDays: parseInt(e.target.value, 10),
                        });
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        fontSize: '14px',
                      }}
                    >
                      <option value={7}>7 dni</option>
                      <option value={14}>14 dni</option>
                      <option value={30}>30 dni</option>
                      <option value={60}>60 dni</option>
                      <option value={90}>90 dni</option>
                    </select>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '15px',
                      marginBottom: '20px',
                    }}
                  >
                    <label style={{ fontSize: '14px', color: '#333' }}>
                      Retencja historii cache (pliki history/cache-*.json):
                    </label>
                    <select
                      value={settings.historyRetentionDays}
                      onChange={(e) => {
                        updateSettings({
                          historyRetentionDays: parseInt(e.target.value, 10),
                        });
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        fontSize: '14px',
                      }}
                    >
                      <option value={7}>7 dni</option>
                      <option value={14}>14 dni</option>
                      <option value={30}>30 dni</option>
                      <option value={60}>60 dni</option>
                      <option value={90}>90 dni</option>
                    </select>
                  </div>

                  {/* Ręczne czyszczenie */}
                  <div
                    style={{
                      padding: '15px',
                      backgroundColor: '#fef3c7',
                      border: '1px solid #f59e0b',
                      borderRadius: '6px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <h4 style={{ margin: '0 0 5px 0', color: '#92400e' }}>
                          Ręczne czyszczenie
                        </h4>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '13px',
                            color: '#a16207',
                          }}
                        >
                          Usuń teraz wszystkie dane starsze niż{' '}
                          {settings.autoCleanupDays} dni
                        </p>
                      </div>
                      <button
                        onClick={handleManualCleanup}
                        disabled={cleanupProcessing}
                        className="admin-btn admin-btn--danger"
                        style={{ minWidth: '120px' }}
                      >
                        {cleanupProcessing ? 'Czyszczenie...' : 'Wyczyść teraz'}
                      </button>
                    </div>

                    {lastCleanupResult && (
                      <div
                        style={{
                          marginTop: '15px',
                          padding: '10px',
                          backgroundColor: '#d1fae5',
                          border: '1px solid #10b981',
                          borderRadius: '4px',
                          fontSize: '13px',
                          color: '#065f46',
                        }}
                      >
                        <strong>Usunięto:</strong>{' '}
                        {lastCleanupResult.deletedLogins} logowań,{' '}
                        {lastCleanupResult.deletedSessions} sesji,{' '}
                        {lastCleanupResult.deletedViews} wyświetleń,{' '}
                        {lastCleanupResult.deletedDownloads} pobrań
                      </div>
                    )}
                  </div>

                  {/* Osierocone pliki graficzne */}
                  <div
                    style={{
                      marginTop: '20px',
                      padding: '15px',
                      backgroundColor: '#fef3c7',
                      border: '1px solid #f59e0b',
                      borderRadius: '6px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <h4 style={{ margin: '0 0 5px 0', color: '#92400e' }}>
                          Osierocone pliki graficzne
                        </h4>
                        <p
                          style={{
                            margin: 0,
                            fontSize: '13px',
                            color: '#a16207',
                          }}
                        >
                          Pliki miniaturek i galerii z usuniętych
                          rewizji/moodboardów
                        </p>
                      </div>
                      <button
                        onClick={handleScanOrphanedFiles}
                        disabled={orphanedFilesScanning}
                        className="admin-btn"
                        style={{ minWidth: '120px' }}
                      >
                        {orphanedFilesScanning
                          ? 'Skanowanie...'
                          : 'Skanuj pliki'}
                      </button>
                    </div>

                    {orphanedFilesScanResult && (
                      <div style={{ marginTop: '15px' }}>
                        <div
                          style={{
                            padding: '10px',
                            backgroundColor:
                              orphanedFilesScanResult.orphanedFiles.length > 0
                                ? '#fef2f2'
                                : '#d1fae5',
                            border: `1px solid ${
                              orphanedFilesScanResult.orphanedFiles.length > 0
                                ? '#ef4444'
                                : '#10b981'
                            }`,
                            borderRadius: '4px',
                            fontSize: '13px',
                            color:
                              orphanedFilesScanResult.orphanedFiles.length > 0
                                ? '#991b1b'
                                : '#065f46',
                          }}
                        >
                          <div style={{ marginBottom: '8px' }}>
                            <strong>Przeskanowano:</strong>{' '}
                            {orphanedFilesScanResult.scannedRevisionThumbnails}{' '}
                            miniaturek rewizji,{' '}
                            {orphanedFilesScanResult.scannedGalleryFiles} plików
                            galerii,{' '}
                            {orphanedFilesScanResult.scannedMoodboardFiles}{' '}
                            plików moodboardu
                          </div>
                          {orphanedFilesScanResult.orphanedFiles.length > 0 ? (
                            <>
                              <div style={{ marginBottom: '8px' }}>
                                <strong>
                                  Znaleziono{' '}
                                  {orphanedFilesScanResult.orphanedFiles.length}{' '}
                                  osieroconych plików
                                </strong>{' '}
                                (
                                {formatBytes(orphanedFilesScanResult.totalSize)}
                                )
                              </div>
                              <div
                                style={{
                                  maxHeight: '150px',
                                  overflow: 'auto',
                                  backgroundColor: '#fff',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  padding: '8px',
                                  marginBottom: '10px',
                                  fontSize: '12px',
                                  fontFamily: 'monospace',
                                }}
                              >
                                {orphanedFilesScanResult.orphanedFiles.map(
                                  (f, i) => (
                                    <div
                                      key={i}
                                      style={{ marginBottom: '2px' }}
                                    >
                                      <span style={{ color: '#666' }}>
                                        [{f.type}]
                                      </span>{' '}
                                      {f.path}{' '}
                                      <span style={{ color: '#999' }}>
                                        ({formatBytes(f.size)})
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                              <button
                                onClick={handleDeleteOrphanedFiles}
                                disabled={orphanedFilesDeleting}
                                className="admin-btn admin-btn--danger"
                                style={{ minWidth: '120px' }}
                              >
                                {orphanedFilesDeleting
                                  ? 'Usuwanie...'
                                  : 'Usuń osierocone pliki'}
                              </button>
                            </>
                          ) : (
                            <div>Brak osieroconych plików</div>
                          )}
                        </div>
                      </div>
                    )}

                    {orphanedFilesDeleteResult && (
                      <div
                        style={{
                          marginTop: '15px',
                          padding: '10px',
                          backgroundColor: '#d1fae5',
                          border: '1px solid #10b981',
                          borderRadius: '4px',
                          fontSize: '13px',
                          color: '#065f46',
                        }}
                      >
                        <strong>Usunięto:</strong>{' '}
                        {orphanedFilesDeleteResult.deleted} plików, zwolniono{' '}
                        {formatBytes(orphanedFilesDeleteResult.freedBytes)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Cache i Miniaturki */}
            <section className="admin-section">
              <h2
                className="admin-section-title admin-section-title-clickable"
                onClick={() => toggleSection('cache')}
              >
                <span>Cache i Miniaturki</span>
                <i
                  className={`las la-angle-up admin-section-toggle ${
                    expandedSections.has('cache') ? '' : 'collapsed'
                  }`}
                ></i>
              </h2>
              {expandedSections.has('cache') && <CacheMonitorSection />}
            </section>
          </>
        )}

        {/* Tab: Pliki */}
        {activeTab === 'files' && (
          <>
            <section className="admin-section">
              <h2
                className="admin-section-title admin-section-title-clickable"
                onClick={() => toggleSection('files')}
              >
                <span>Menedżer plików</span>
                <i
                  className={`las la-angle-up admin-section-toggle ${
                    expandedSections.has('files') ? '' : 'collapsed'
                  }`}
                ></i>
              </h2>
              {expandedSections.has('files') && <FileManager />}
            </section>

            <section className="admin-section">
              <h2
                className="admin-section-title admin-section-title-clickable"
                onClick={() => toggleSection('volume')}
              >
                <span>Zawartość volume (/data-storage)</span>
                <i
                  className={`las la-angle-up admin-section-toggle ${
                    expandedSections.has('volume') ? '' : 'collapsed'
                  }`}
                />
              </h2>
              {expandedSections.has('volume') && <VolumeBrowserSection />}
            </section>
          </>
        )}

        {/* Tab: Dane (hierarchia projektów i moodboardów, backup) */}
        {activeTab === 'data' && (
          <section className="admin-section">
            <h2
              className="admin-section-title admin-section-title-clickable"
              onClick={() => toggleSection('data-storage')}
            >
              <span>Projekty i moodboardy (/data-storage)</span>
              <i
                className={`las la-angle-up admin-section-toggle ${
                  expandedSections.has('data-storage') ? '' : 'collapsed'
                }`}
              />
            </h2>
            {expandedSections.has('data-storage') && <DataStorageSection />}
          </section>
        )}

        {/* Tab: Moodboardy – konfiguracja paska rysowania */}
        {activeTab === 'moodboard' && (
          <MoodboardDrawingConfigSection
            isExpanded={expandedSections.has('moodboard-drawing')}
            onToggleSection={() => toggleSection('moodboard-drawing')}
            groups={groups}
          />
        )}
      </div>
    </>
  );
};

export default AdminPanel;

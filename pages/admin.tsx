import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import FileManager from '../src/components/FileManager';
import LoadingOverlay from '../src/components/LoadingOverlay';
import { PendingRequestsSection } from '../src/components/admin/PendingRequestsSection';
import { StatsOverview } from '../src/components/admin/StatsOverview';
import { CacheMonitorSection } from '../src/components/admin/CacheMonitorSection';
import { VolumeBrowserSection } from '../src/components/admin/VolumeBrowserSection';
import { logger } from '../src/utils/logger';

interface PendingEmail {
  email: string;
  timestamp: string;
  ip: string;
}

interface UserGroup {
  id: string;
  name: string;
  clientName: string;
  galleryFolder: string;
  users: string[];
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
  const [data, setData] = useState<AdminData>({
    pending: [],
    whitelist: [],
    blacklist: [],
  });
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Stan dla formularza nowej grupy
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupClient, setNewGroupClient] = useState('');
  const [newGroupFolder, setNewGroupFolder] = useState('');
  const [folderManuallyEdited, setFolderManuallyEdited] = useState(false);

  // Stan dla edycji grupy
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editClient, setEditClient] = useState('');
  const [editFolder, setEditFolder] = useState('');

  // Stan dla statusu folderów grup
  const [folderStatus, setFolderStatus] = useState<
    Record<
      string,
      {
        exists: boolean;
        foldersCount?: number;
        filesCount?: number;
        error?: string;
      }
    >
  >({});

  // Stan dla ustawień
  const [settings, setSettings] = useState<{
    highlightKeywords: boolean;
    autoCleanupEnabled: boolean;
    autoCleanupDays: number;
    thumbnailAnimationDelay: number;
  }>({
    highlightKeywords: true,
    autoCleanupEnabled: false,
    autoCleanupDays: 7,
    thumbnailAnimationDelay: 55,
  });

  // Stan dla ręcznego czyszczenia
  const [cleanupProcessing, setCleanupProcessing] = useState(false);
  const [lastCleanupResult, setLastCleanupResult] = useState<{
    deletedLogins: number;
    deletedSessions: number;
    deletedViews: number;
    deletedDownloads: number;
  } | null>(null);

  // Stan dla rozwiniętych sekcji
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set([
      'stats',
      'whitelist',
      'blacklist',
      'groups',
      'settings',
      'data-cleanup',
      'cache',
      'files',
      'volume',
    ])
  );

  // Stan dla formularzy dodawania emaili
  const [newWhitelistEmail, setNewWhitelistEmail] = useState('');
  const [newBlacklistEmail, setNewBlacklistEmail] = useState('');

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  // Automatyczne ustawianie folderu na podstawie nazwy grupy
  const handleGroupNameChange = (name: string) => {
    setNewGroupName(name);
    // Jeśli folder nie był ręcznie edytowany, ustaw go automatycznie
    if (!folderManuallyEdited) {
      setNewGroupFolder(name ? `${name}/` : '');
    }
  };

  const handleFolderChange = (folder: string) => {
    setNewGroupFolder(folder);
    setFolderManuallyEdited(true);
  };

  const resetGroupForm = () => {
    setNewGroupName('');
    setNewGroupClient('');
    setNewGroupFolder('');
    setFolderManuallyEdited(false);
  };

  const fetchData = async () => {
    try {
      const response = await fetch('/api/auth/admin/pending-emails');
      const result = await response.json();
      setData(result);
    } catch (error) {
      logger.error('Error fetching data', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await fetch('/api/auth/admin/groups/list');
      const result = await response.json();
      if (result.success) {
        setGroups(result.groups);
        // Sprawdź status folderów dla każdej grupy
        checkFoldersStatus(result.groups);
      }
    } catch (error) {
      logger.error('Error fetching groups', error);
    }
  };

  const checkFoldersStatus = async (groupsList: UserGroup[]) => {
    if (groupsList.length === 0) {
      setFolderStatus({});
      return;
    }
    try {
      const response = await fetch('/api/admin/files/check-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: groupsList.map((g) => ({
            id: g.id,
            path: g.galleryFolder || '',
          })),
        }),
      });
      const data = await response.json();
      setFolderStatus(data.statuses ?? {});
    } catch (error) {
      logger.error('Error checking folders', error);
      const fallback: Record<string, { exists: boolean; error?: string }> = {};
      for (const g of groupsList) {
        fallback[g.id] = { exists: false, error: 'Błąd sprawdzania' };
      }
      setFolderStatus(fallback);
    }
  };

  useEffect(() => {
    checkAdminAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    if (authStatus?.isAdminLoggedIn) {
      fetchData();
      fetchGroups();
      fetchSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- authStatus is the intended trigger
  }, [authStatus]);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings');
      const result = await response.json();
      if (result.success && result.settings) {
        setSettings(result.settings);
      }
    } catch (error) {
      logger.error('Error fetching settings', error);
    }
  };

  const updateSettings = async (
    newSettings: Partial<{
      highlightKeywords: boolean;
      autoCleanupEnabled: boolean;
      autoCleanupDays: number;
      thumbnailAnimationDelay: number;
    }>
  ) => {
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      const result = await response.json();
      if (result.success) {
        setSettings(result.settings);
      }
    } catch (error) {
      logger.error('Error updating settings', error);
      alert('Błąd aktualizacji ustawień');
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

  // ==================== FUNKCJE GRUP ====================

  const handleCreateGroup = async () => {
    if (!newGroupName || !newGroupClient || !newGroupFolder) {
      alert('Wszystkie pola są wymagane');
      return;
    }

    setProcessing('create-group');
    try {
      const response = await fetch('/api/auth/admin/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName,
          clientName: newGroupClient,
          galleryFolder: newGroupFolder,
        }),
      });

      if (response.ok) {
        resetGroupForm();
        await fetchGroups();
      } else {
        const error = await response.json();
        alert(`Błąd: ${error.error}`);
      }
    } catch (error) {
      logger.error('Error creating group', error);
      alert('Błąd tworzenia grupy');
    } finally {
      setProcessing(null);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tę grupę?')) return;

    setProcessing(groupId);
    try {
      const response = await fetch('/api/auth/admin/groups/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: groupId }),
      });

      if (response.ok) {
        await fetchGroups();
      } else {
        const error = await response.json();
        alert(`Błąd: ${error.error}`);
      }
    } catch (error) {
      logger.error('Error deleting group', error);
      alert('Błąd usuwania grupy');
    } finally {
      setProcessing(null);
    }
  };

  const startEditGroup = (group: UserGroup) => {
    setEditingGroup(group.id);
    setEditName(group.name);
    setEditClient(group.clientName);
    setEditFolder(group.galleryFolder);
  };

  const handleUpdateGroup = async (groupId: string) => {
    setProcessing(groupId);
    try {
      const response = await fetch('/api/auth/admin/groups/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: groupId,
          name: editName,
          clientName: editClient,
          galleryFolder: editFolder,
        }),
      });

      if (response.ok) {
        setEditingGroup(null);
        await fetchGroups();
      } else {
        const error = await response.json();
        alert(`Błąd: ${error.error}`);
      }
    } catch (error) {
      logger.error('Error updating group', error);
      alert('Błąd aktualizacji grupy');
    } finally {
      setProcessing(null);
    }
  };

  const handleAssignUser = async (groupId: string, email: string) => {
    setProcessing(email);
    try {
      const response = await fetch('/api/auth/admin/groups/assign-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, email, action: 'add' }),
      });

      if (response.ok) {
        await fetchGroups();
      } else {
        const error = await response.json();
        alert(`Błąd: ${error.error}`);
      }
    } catch (error) {
      logger.error('Error assigning user', error);
      alert('Błąd przypisywania użytkownika');
    } finally {
      setProcessing(null);
    }
  };

  const handleRemoveUserFromGroup = async (groupId: string, email: string) => {
    setProcessing(email);
    try {
      const response = await fetch('/api/auth/admin/groups/assign-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, email, action: 'remove' }),
      });

      if (response.ok) {
        await fetchGroups();
      } else {
        const error = await response.json();
        alert(`Błąd: ${error.error}`);
      }
    } catch (error) {
      logger.error('Error removing user from group', error);
      alert('Błąd usuwania użytkownika z grupy');
    } finally {
      setProcessing(null);
    }
  };

  // Pobierz użytkowników nieprzypisanych do żadnej grupy
  const getUnassignedUsers = (): string[] => {
    const assignedUsers = new Set(groups.flatMap((g) => g.users));
    return data.whitelist.filter((email) => !assignedUsers.has(email));
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
        await fetchData(); // Odśwież dane
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
        await fetchData(); // Odśwież dane
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

    // Walidacja emaila
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
        await fetchData(); // Odśwież dane
        // Wyczyść pole formularza
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
    return null; // Przekierowanie w toku
  }

  if (loading) {
    return <LoadingOverlay message="Ładowanie..." />;
  }

  return (
    <>
      <Head>
        <title>Panel Administracyjny - Content Browser</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="admin-page">
        <div className="admin-header">
          <h1 className="admin-header-title">Panel administracyjny</h1>
          <div className="admin-header-actions">
            <span className="admin-header-user">
              Zalogowany: <strong>{authStatus.email}</strong>
            </span>
            <button
              onClick={handleAdminLogout}
              type="button"
              className="admin-btn admin-btn--danger"
            >
              Wyloguj admina
            </button>
          </div>
        </div>

        <PendingRequestsSection
          pending={data.pending}
          processing={processing}
          onAction={handlePendingEmailAction}
        />

        {/* Statystyki użytkowników */}
        <section className="admin-section">
          <h2
            className="admin-section-title admin-section-title-clickable"
            onClick={() => toggleSection('stats')}
          >
            <span>Statystyki użytkowników</span>
            <i
              className={`las la-angle-up admin-section-toggle ${
                expandedSections.has('stats') ? '' : 'collapsed'
              }`}
            ></i>
          </h2>
          {expandedSections.has('stats') && <StatsOverview />}
        </section>

        {/* Biała lista */}
        <section className="admin-section">
          <h2
            className="admin-section-title admin-section-title--success admin-section-title-clickable"
            onClick={() => toggleSection('whitelist')}
          >
            <span>Biała lista ({data.whitelist.length})</span>
            <i
              className={`las la-angle-up admin-section-toggle ${
                expandedSections.has('whitelist') ? '' : 'collapsed'
              }`}
            ></i>
          </h2>

          {expandedSections.has('whitelist') && (
            <>
              {/* Formularz dodawania emaila */}
              <div className="admin-form-box" style={{ marginBottom: '16px' }}>
                <div
                  style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
                >
                  <input
                    type="email"
                    placeholder="Dodaj email do białej listy"
                    value={newWhitelistEmail}
                    onChange={(e) => setNewWhitelistEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddToList(newWhitelistEmail, 'whitelist');
                      }
                    }}
                    className="admin-input"
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={() =>
                      handleAddToList(newWhitelistEmail, 'whitelist')
                    }
                    disabled={
                      processing?.startsWith('add-whitelist-') ||
                      !newWhitelistEmail.trim()
                    }
                    type="button"
                    className="admin-btn admin-btn--success"
                  >
                    Dodaj
                  </button>
                </div>
              </div>

              {data.whitelist.length === 0 ? (
                <p className="admin-empty-msg">Brak emaili na białej liście</p>
              ) : (
                <div className="admin-list-grid">
                  {data.whitelist.map((email) => (
                    <div
                      key={email}
                      className="admin-list-item admin-list-item--success"
                    >
                      <span>{email}</span>
                      <button
                        onClick={() => handleRemoveFromList(email, 'whitelist')}
                        disabled={processing === email}
                        type="button"
                        className="admin-btn admin-btn--danger-sm"
                      >
                        Usuń
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Czarna lista */}
        <section className="admin-section">
          <h2
            className="admin-section-title admin-section-title-clickable"
            onClick={() => toggleSection('blacklist')}
          >
            <span>Czarna lista ({data.blacklist.length})</span>
            <i
              className={`las la-angle-up admin-section-toggle ${
                expandedSections.has('blacklist') ? '' : 'collapsed'
              }`}
            ></i>
          </h2>

          {expandedSections.has('blacklist') && (
            <>
              {/* Formularz dodawania emaila */}
              <div className="admin-form-box" style={{ marginBottom: '16px' }}>
                <div
                  style={{ display: 'flex', gap: '10px', alignItems: 'center' }}
                >
                  <input
                    type="email"
                    placeholder="Dodaj email do czarnej listy"
                    value={newBlacklistEmail}
                    onChange={(e) => setNewBlacklistEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddToList(newBlacklistEmail, 'blacklist');
                      }
                    }}
                    className="admin-input"
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={() =>
                      handleAddToList(newBlacklistEmail, 'blacklist')
                    }
                    disabled={
                      processing?.startsWith('add-blacklist-') ||
                      !newBlacklistEmail.trim()
                    }
                    type="button"
                    className="admin-btn admin-btn--danger"
                  >
                    Dodaj
                  </button>
                </div>
              </div>

              {data.blacklist.length === 0 ? (
                <p className="admin-empty-msg">Brak emaili na czarnej liście</p>
              ) : (
                <div className="admin-list-grid">
                  {data.blacklist.map((email) => (
                    <div
                      key={email}
                      className="admin-list-item admin-list-item--danger"
                    >
                      <span>{email}</span>
                      <button
                        onClick={() => handleRemoveFromList(email, 'blacklist')}
                        disabled={processing === email}
                        type="button"
                        className="admin-btn admin-btn--danger-sm"
                      >
                        Usuń
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* Grupy użytkowników */}
        <section className="admin-section">
          <h2
            className="admin-section-title admin-section-title-clickable"
            onClick={() => toggleSection('groups')}
          >
            <span>Grupy użytkowników ({groups.length})</span>
            <i
              className={`las la-angle-up admin-section-toggle ${
                expandedSections.has('groups') ? '' : 'collapsed'
              }`}
            ></i>
          </h2>

          {expandedSections.has('groups') && (
            <>
              {/* Formularz nowej grupy */}
              <div className="admin-form-box">
                <h3>Utwórz nową grupę</h3>
                <div className="admin-form-grid">
                  <input
                    type="text"
                    placeholder="Nazwa grupy"
                    value={newGroupName}
                    onChange={(e) => handleGroupNameChange(e.target.value)}
                    className="admin-input"
                  />
                  <input
                    type="text"
                    placeholder="Nazwa klienta"
                    value={newGroupClient}
                    onChange={(e) => setNewGroupClient(e.target.value)}
                    className="admin-input"
                  />
                  <input
                    type="text"
                    placeholder="Folder galerii (np. klient1/)"
                    value={newGroupFolder}
                    onChange={(e) => handleFolderChange(e.target.value)}
                    className="admin-input"
                  />
                  <button
                    onClick={handleCreateGroup}
                    disabled={processing === 'create-group'}
                    type="button"
                    className="admin-btn admin-btn--purple"
                  >
                    {processing === 'create-group' ? 'Tworzenie...' : 'Utwórz'}
                  </button>
                </div>
              </div>

              {/* Lista grup */}
              {groups.length === 0 ? (
                <p className="admin-empty-msg">Brak grup</p>
              ) : (
                <div style={{ display: 'grid', gap: '15px' }}>
                  {groups.map((group) => (
                    <div key={group.id} className="admin-card">
                      {editingGroup === group.id ? (
                        // Tryb edycji
                        <div>
                          <div
                            style={{
                              display: 'grid',
                              gap: '10px',
                              gridTemplateColumns: '1fr 1fr 1fr',
                              marginBottom: '10px',
                            }}
                          >
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="Nazwa grupy"
                              style={{
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #ddd',
                              }}
                            />
                            <input
                              type="text"
                              value={editClient}
                              onChange={(e) => setEditClient(e.target.value)}
                              placeholder="Nazwa klienta"
                              style={{
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #ddd',
                              }}
                            />
                            <input
                              type="text"
                              value={editFolder}
                              onChange={(e) => setEditFolder(e.target.value)}
                              placeholder="Folder galerii"
                              style={{
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #ddd',
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                              onClick={() => handleUpdateGroup(group.id)}
                              disabled={processing === group.id}
                              className="admin-btn admin-btn--success"
                              style={{ fontSize: '12px', padding: '6px 12px' }}
                            >
                              Zapisz
                            </button>
                            <button
                              onClick={() => setEditingGroup(null)}
                              style={{
                                backgroundColor: '#e5e7eb',
                                color: '#111827',
                                border: '1px solid #d1d5db',
                                padding: '6px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                              }}
                            >
                              Anuluj
                            </button>
                          </div>
                        </div>
                      ) : (
                        // Tryb wyświetlania
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              marginBottom: '10px',
                            }}
                          >
                            <div>
                              <h3
                                style={{
                                  margin: '0 0 8px 0',
                                  color: '#111827',
                                }}
                              >
                                {group.name}
                              </h3>
                              <div
                                style={{
                                  fontSize: '14px',
                                  color: '#666',
                                  lineHeight: '1.6',
                                }}
                              >
                                <div>
                                  <strong>Klient:</strong> {group.clientName}
                                </div>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                  }}
                                >
                                  <span>
                                    <strong>Folder:</strong>{' '}
                                    {(() => {
                                      const folder = group.galleryFolder || '';
                                      // Jeśli to pełny URL, wyciągnij ścieżkę po gallery/
                                      if (folder.includes('://')) {
                                        const match =
                                          folder.match(/gallery\/(.*)$/);
                                        return match ? match[1] || '/' : folder;
                                      }
                                      return folder || '/';
                                    })()}
                                  </span>
                                  {folderStatus[group.id] && (
                                    <span
                                      style={{
                                        padding: '2px 8px',
                                        borderRadius: '999px',
                                        fontSize: '11px',
                                        fontWeight: 500,
                                        border: '1px solid #e5e7eb',
                                        backgroundColor: '#f9fafb',
                                        color: '#374151',
                                      }}
                                    >
                                      {folderStatus[group.id].exists
                                        ? `${
                                            folderStatus[group.id].foldersCount
                                          } folderów, ${
                                            folderStatus[group.id].filesCount
                                          } plików`
                                        : `Folder nie istnieje`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '5px' }}>
                              <a
                                href={`/?groupId=${group.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  backgroundColor: '#2563eb',
                                  color: 'white',
                                  border: '1px solid #2563eb',
                                  padding: '4px 10px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  textDecoration: 'none',
                                  display: 'inline-block',
                                }}
                              >
                                Podgląd
                              </a>
                              <button
                                onClick={() => startEditGroup(group)}
                                className="admin-btn"
                                style={{
                                  padding: '4px 10px',
                                  fontSize: '12px',
                                  borderColor: '#d1d5db',
                                }}
                              >
                                Edytuj
                              </button>
                              <button
                                onClick={() => handleDeleteGroup(group.id)}
                                disabled={processing === group.id}
                                style={{
                                  backgroundColor: '#dc2626',
                                  color: 'white',
                                  border: '1px solid #dc2626',
                                  padding: '4px 10px',
                                  borderRadius: '4px',
                                  cursor:
                                    processing === group.id
                                      ? 'not-allowed'
                                      : 'pointer',
                                  fontSize: '12px',
                                  opacity: processing === group.id ? 0.6 : 1,
                                }}
                              >
                                Usuń
                              </button>
                            </div>
                          </div>

                          {/* Użytkownicy w grupie */}
                          <div style={{ marginTop: '10px' }}>
                            <strong style={{ fontSize: '13px' }}>
                              Użytkownicy ({group.users.length}):
                            </strong>
                            {group.users.length === 0 ? (
                              <span
                                style={{
                                  color: '#666',
                                  fontStyle: 'italic',
                                  marginLeft: '10px',
                                  fontSize: '13px',
                                }}
                              >
                                Brak
                              </span>
                            ) : (
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: '5px',
                                  marginTop: '5px',
                                }}
                              >
                                {group.users.map((email) => (
                                  <span
                                    key={email}
                                    style={{
                                      background: '#e1bee7',
                                      padding: '3px 8px',
                                      borderRadius: '12px',
                                      fontSize: '12px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                    }}
                                  >
                                    {email}
                                    <button
                                      onClick={() =>
                                        handleRemoveUserFromGroup(
                                          group.id,
                                          email
                                        )
                                      }
                                      disabled={processing === email}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#f44336',
                                        cursor: 'pointer',
                                        padding: '0',
                                        fontSize: '14px',
                                        lineHeight: '1',
                                      }}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Dodaj użytkownika */}
                          {getUnassignedUsers().length > 0 && (
                            <div style={{ marginTop: '10px' }}>
                              <select
                                onChange={(e) => {
                                  if (e.target.value) {
                                    handleAssignUser(group.id, e.target.value);
                                    e.target.value = '';
                                  }
                                }}
                                style={{
                                  padding: '5px 10px',
                                  borderRadius: '4px',
                                  border: '1px solid #ddd',
                                  fontSize: '12px',
                                }}
                              >
                                <option value="">+ Dodaj użytkownika...</option>
                                {getUnassignedUsers().map((email) => (
                                  <option key={email} value={email}>
                                    {email}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

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
                    Włącz/wyłącz kolorowanie słów kluczowych w nazwach plików
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
                        updateSettings({ highlightKeywords: e.target.checked });
                      }}
                      style={{
                        width: '20px',
                        height: '20px',
                        cursor: 'pointer',
                      }}
                    />
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>
                      {settings.highlightKeywords ? 'Włączone' : 'Wyłączone'}
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
                    Czas opóźnienia między pojawianiem się kolejnych miniaturek
                    (0–1000 ms)
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
                      updateSettings({ autoCleanupEnabled: e.target.checked });
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
                      style={{ margin: 0, fontSize: '13px', color: '#a16207' }}
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
                    <strong>Usunięto:</strong> {lastCleanupResult.deletedLogins}{' '}
                    logowań, {lastCleanupResult.deletedSessions} sesji,{' '}
                    {lastCleanupResult.deletedViews} wyświetleń,{' '}
                    {lastCleanupResult.deletedDownloads} pobrań
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

        {/* Menedżer plików */}
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

        {/* Zawartość volume /data-storage */}
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

        <div style={{ marginTop: '40px', textAlign: 'center' }}>
          <button
            onClick={() => {
              fetchData();
              fetchGroups();
            }}
            style={{
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer',
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

// Disable static generation to avoid router issues
export async function getServerSideProps() {
  return {
    props: {},
  };
}

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import FileManager from '../src/components/FileManager';
import FolderConverter from '../src/components/FolderConverter';
import LoadingOverlay from '../src/components/LoadingOverlay';
import { PendingRequestsSection } from '../src/components/admin/PendingRequestsSection';
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
  const [settings, setSettings] = useState<{ highlightKeywords: boolean }>({
    highlightKeywords: true,
  });

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
  }, []);

  useEffect(() => {
    if (authStatus?.isAdminLoggedIn) {
      fetchData();
      fetchGroups();
      fetchSettings();
    }
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

  const updateSettings = async (newSettings: {
    highlightKeywords: boolean;
  }) => {
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
    action: 'approve' | 'reject',
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
    listType: 'whitelist' | 'blacklist',
  ) => {
    if (
      !confirm(
        `Czy na pewno chcesz usunąć ${email} z ${listType === 'whitelist' ? 'białej' : 'czarnej'} listy?`,
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
          <h1 className="admin-header-title">👑 Panel Administracyjny</h1>
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

        {/* Biała lista */}
        <section className="admin-section">
          <h2 className="admin-section-title admin-section-title--success">
            Biała lista ({data.whitelist.length})
          </h2>

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
        </section>

        {/* Czarna lista */}
        <section className="admin-section">
          <h2 className="admin-section-title admin-section-title--danger">
            Czarna lista ({data.blacklist.length})
          </h2>

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
        </section>

        {/* Grupy użytkowników */}
        <section className="admin-section">
          <h2 className="admin-section-title admin-section-title--purple">
            Grupy użytkowników ({groups.length})
          </h2>

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
            <p style={{ color: '#666', fontStyle: 'italic' }}>Brak grup</p>
          ) : (
            <div style={{ display: 'grid', gap: '15px' }}>
              {groups.map((group) => (
                <div
                  key={group.id}
                  style={{
                    background: '#faf5fc',
                    padding: '15px',
                    borderRadius: '8px',
                    border: '1px solid #9C27B0',
                  }}
                >
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
                          style={{
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          Zapisz
                        </button>
                        <button
                          onClick={() => setEditingGroup(null)}
                          style={{
                            backgroundColor: '#666',
                            color: 'white',
                            border: 'none',
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
                          <h3 style={{ margin: '0 0 8px 0', color: '#9C27B0' }}>
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
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                    backgroundColor: folderStatus[group.id]
                                      .exists
                                      ? '#e8f5e9'
                                      : '#ffebee',
                                    color: folderStatus[group.id].exists
                                      ? '#2e7d32'
                                      : '#c62828',
                                  }}
                                >
                                  {folderStatus[group.id].exists
                                    ? `✓ ${folderStatus[group.id].foldersCount} folderów, ${folderStatus[group.id].filesCount} plików`
                                    : `✗ Folder nie istnieje`}
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
                              backgroundColor: '#9C27B0',
                              color: 'white',
                              border: 'none',
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
                            style={{
                              backgroundColor: '#2196F3',
                              color: 'white',
                              border: 'none',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            Edytuj
                          </button>
                          <button
                            onClick={() => handleDeleteGroup(group.id)}
                            disabled={processing === group.id}
                            style={{
                              backgroundColor: '#f44336',
                              color: 'white',
                              border: 'none',
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
                                    handleRemoveUserFromGroup(group.id, email)
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
        </section>

        {/* Ustawienia */}
        <section style={{ marginBottom: '40px' }}>
          <h2
            style={{
              color: '#FF9800',
              borderBottom: '2px solid #ddd',
              paddingBottom: '10px',
            }}
          >
            Ustawienia
          </h2>

          <div
            style={{
              background: '#fff3e0',
              padding: '15px',
              borderRadius: '8px',
              border: '1px solid #FF9800',
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
                <h3 style={{ margin: '0 0 5px 0', color: '#FF9800' }}>
                  Kolorowanie słów kluczowych
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                  Włącz/wyłącz kolorowanie słów kluczowych w nazwach plików
                </p>
              </div>
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
        </section>

        {/* Menedżer plików */}
        <FileManager />

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

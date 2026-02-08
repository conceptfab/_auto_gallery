import React, { useState } from 'react';
import type { UserGroup } from '@/src/types/admin';
import type { FolderStatusMap } from '@/src/hooks/useAdminGroups';
import { logger } from '@/src/utils/logger';

function formatFolderDisplay(folder: string): string {
  if (!folder) return '/';
  if (folder.includes('://')) {
    const match = folder.match(/gallery\/(.*)$/);
    return match ? match[1] || '/' : folder;
  }
  return folder;
}

export interface GroupsManagerProps {
  groups: UserGroup[];
  folderStatus: FolderStatusMap;
  unassignedUsers: string[];
  processing: string | null;
  setProcessing: (value: string | null) => void;
  isExpanded: boolean;
  onToggleSection: () => void;
  onGroupsChange: () => void;
}

export const GroupsManager: React.FC<GroupsManagerProps> = ({
  groups,
  folderStatus,
  unassignedUsers,
  processing,
  setProcessing,
  isExpanded,
  onToggleSection,
  onGroupsChange,
}) => {
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupClient, setNewGroupClient] = useState('');
  const [newGroupFolder, setNewGroupFolder] = useState('');
  const [folderManuallyEdited, setFolderManuallyEdited] = useState(false);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editClient, setEditClient] = useState('');
  const [editFolder, setEditFolder] = useState('');
  const [editColor, setEditColor] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    projectsMoved: number;
    moodboardsMoved: number;
    errors: string[];
    details: string[];
  } | null>(null);

  const handleGroupNameChange = (name: string) => {
    setNewGroupName(name);
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
        await onGroupsChange();
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
        await onGroupsChange();
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
    setEditColor(group.color ?? '');
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
          color: editColor || undefined,
        }),
      });
      if (response.ok) {
        setEditingGroup(null);
        await onGroupsChange();
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
        await onGroupsChange();
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
        await onGroupsChange();
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

  return (
    <section className="admin-section">
      <h2
        className="admin-section-title admin-section-title-clickable"
        onClick={onToggleSection}
      >
        <span>Grupy użytkowników ({groups.length})</span>
        <i
          className={`las la-angle-up admin-section-toggle ${
            isExpanded ? '' : 'collapsed'
          }`}
        />
      </h2>

      {isExpanded && (
        <>
          <div className="admin-form-box" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={async () => {
                setMigrating(true);
                setMigrationResult(null);
                try {
                  const res = await fetch('/api/admin/migrate-to-group-folders', {
                    method: 'POST',
                  });
                  const data = await res.json();
                  if (data.success) {
                    setMigrationResult(data.report);
                    await onGroupsChange();
                  } else {
                    alert(data.error || 'Błąd migracji');
                  }
                } catch (err) {
                  logger.error('Migration error', err);
                  alert('Błąd migracji');
                } finally {
                  setMigrating(false);
                }
              }}
              disabled={migrating}
              className="admin-btn admin-btn--purple"
            >
              {migrating ? 'Migracja...' : 'Migruj dane do folderów grup'}
            </button>
            {migrationResult && (
              <span style={{ fontSize: '12px', color: '#374151' }}>
                Przeniesiono: {migrationResult.projectsMoved} projektów, {migrationResult.moodboardsMoved} moodboardów
                {migrationResult.errors.length > 0 && (
                  <span style={{ color: '#dc2626' }}> ({migrationResult.errors.length} błędów)</span>
                )}
              </span>
            )}
          </div>

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

          {groups.length === 0 ? (
            <p className="admin-empty-msg">Brak grup</p>
          ) : (
            <div style={{ display: 'grid', gap: '15px' }}>
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="admin-card"
                  style={
                    group.color
                      ? {
                          borderLeftWidth: '4px',
                          borderLeftStyle: 'solid',
                          borderLeftColor: group.color,
                        }
                      : undefined
                  }
                >
                  {editingGroup === group.id ? (
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', gridColumn: '1 / -1' }}>
                          <span style={{ fontSize: '13px', color: '#374151' }}>Kolor:</span>
                          <input
                            type="color"
                            value={editColor || '#6366f1'}
                            onChange={(e) => setEditColor(e.target.value)}
                            title="Kolor grupy"
                            style={{
                              width: '28px',
                              height: '28px',
                              padding: 0,
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setEditColor('')}
                            style={{
                              fontSize: '12px',
                              padding: '4px 8px',
                              color: '#6b7280',
                              background: '#f3f4f6',
                              border: '1px solid #e5e7eb',
                              borderRadius: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            Wyczyść
                          </button>
                        </div>
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
                                {formatFolderDisplay(group.galleryFolder || '')}
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
                                        folderStatus[group.id].foldersCount ?? 0
                                      } folderów, ${
                                        folderStatus[group.id].filesCount ?? 0
                                      } plików`
                                    : 'Folder nie istnieje'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <a
                            href={`/preview/${encodeURIComponent(group.clientName)}`}
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

                      {unassignedUsers.length > 0 && (
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
                            {unassignedUsers.map((email) => (
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
  );
};

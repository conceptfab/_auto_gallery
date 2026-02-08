import React, { useState, useEffect } from 'react';
import { logger } from '@/src/utils/logger';
import type { Project } from '@/src/utils/projectsStorage';
import type { UserGroup } from '@/src/types/admin';

export interface ProjectsSectionProps {
  isExpanded: boolean;
  onToggleSection: () => void;
  /** Grupy (tylko w widoku admina) – do oznakowania kolorem i przypisania projektu do grupy */
  groups?: UserGroup[];
  onGroupsChange?: () => void;
}

export const ProjectsSection: React.FC<ProjectsSectionProps> = ({
  isExpanded,
  onToggleSection,
  groups = [],
  onGroupsChange,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [updatingGroupId, setUpdatingGroupId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [newGroupId, setNewGroupId] = useState('');

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/admin/projects/list');
      const data = await res.json();
      if (data.success && Array.isArray(data.projects)) {
        setProjects(data.projects);
      }
    } catch (error) {
      logger.error('Error fetching projects', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isExpanded) {
      setLoading(true);
      fetchProjects();
    }
  }, [isExpanded]);

  const handleAdd = async () => {
    if (!newName.trim()) {
      alert('Podaj nazwę projektu');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/admin/projects/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || undefined,
          groupId: newGroupId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewName('');
        setNewDescription('');
        await fetchProjects();
      } else {
        alert(data.error || 'Błąd dodawania projektu');
      }
    } catch (error) {
      logger.error('Error adding project', error);
      alert('Błąd dodawania projektu');
    } finally {
      setAdding(false);
    }
  };

  const startEditDescription = (p: Project) => {
    setEditingId(p.id);
    setEditDescription(p.description ?? '');
  };

  const cancelEditDescription = () => {
    setEditingId(null);
    setEditDescription('');
  };

  const handleUpdateDescription = async (id: string) => {
    setSavingId(id);
    try {
      const res = await fetch('/api/admin/projects/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, description: editDescription }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingId(null);
        setEditDescription('');
        await fetchProjects();
      } else {
        alert(data.error || 'Błąd zapisywania opisu');
      }
    } catch (error) {
      logger.error('Error updating project description', error);
      alert('Błąd zapisywania opisu');
    } finally {
      setSavingId(null);
    }
  };

  const handleGroupChange = async (projectId: string, toGroupId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const fromGroupId = project.groupId || '';
    if (fromGroupId === toGroupId) return;
    setUpdatingGroupId(projectId);
    try {
      const res = await fetch('/api/admin/projects/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          fromGroupId: fromGroupId || undefined,
          toGroupId: toGroupId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchProjects();
        onGroupsChange?.();
      } else {
        alert(data.error || 'Błąd przenoszenia projektu');
      }
    } catch (error) {
      logger.error('Error moving project', error);
      alert('Błąd przenoszenia projektu');
    } finally {
      setUpdatingGroupId(null);
    }
  };

  const handleCopyProject = async (projectId: string, toGroupId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    setCopyingId(projectId);
    try {
      const res = await fetch('/api/admin/projects/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          fromGroupId: project.groupId || undefined,
          toGroupId: toGroupId || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchProjects();
      } else {
        alert(data.error || 'Błąd kopiowania projektu');
      }
    } catch (error) {
      logger.error('Error copying project', error);
      alert('Błąd kopiowania projektu');
    } finally {
      setCopyingId(null);
    }
  };

  const handleDelete = async (id: string, groupId?: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten projekt?')) return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/admin/projects/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, groupId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchProjects();
      } else {
        alert(data.error || 'Błąd usuwania projektu');
      }
    } catch (error) {
      logger.error('Error deleting project', error);
      alert('Błąd usuwania projektu');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="admin-section">
      <h2
        className="admin-section-title admin-section-title-clickable"
        onClick={onToggleSection}
      >
        <span>Projekty ({projects.length})</span>
        <i
          className={`las la-angle-up admin-section-toggle ${
            isExpanded ? '' : 'collapsed'
          }`}
        />
      </h2>

      {isExpanded && (
        <>
          <div className="admin-form-box">
            <h3>Dodaj projekt</h3>
            <div className="admin-projects-form">
              <input
                type="text"
                placeholder="Nazwa projektu"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="admin-input"
                style={{ flex: '1 1 200px' }}
              />
              <input
                type="text"
                placeholder="Opis (opcjonalnie)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="admin-input"
                style={{ flex: '1 1 200px' }}
              />
              {groups.length > 0 && (
                <select
                  value={newGroupId}
                  onChange={(e) => setNewGroupId(e.target.value)}
                  className="admin-input"
                  style={{ flex: '0 0 auto', minWidth: '120px' }}
                >
                  <option value="">— globalne —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleAdd}
                disabled={adding}
                className="admin-btn admin-btn--success"
              >
                {adding ? 'Dodawanie...' : 'Dodaj'}
              </button>
            </div>
          </div>

          {loading ? (
            <p className="admin-empty-msg">Ładowanie projektów...</p>
          ) : projects.length === 0 ? (
            <p className="admin-empty-msg">
              Brak projektów. Dodaj pierwszy powyżej.
            </p>
          ) : (
            <div className="admin-projects-grid">
              {projects.map((p) => {
                const groupColor = groups.length && p.groupId
                  ? groups.find((g) => g.id === p.groupId)?.color
                  : undefined;
                return (
                <div
                  key={p.id}
                  className="admin-project-tile"
                  style={
                    groupColor
                      ? {
                          borderLeftWidth: '4px',
                          borderLeftStyle: 'solid',
                          borderLeftColor: groupColor,
                        }
                      : undefined
                  }
                >
                  <div className="admin-project-tile-body">
                    <h4 className="admin-project-tile-title">{p.name}</h4>
                    {editingId === p.id ? (
                      <div className="admin-project-tile-edit">
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Opis projektu"
                          className="admin-input"
                          rows={3}
                          style={{
                            width: '100%',
                            resize: 'vertical',
                            marginBottom: '8px',
                          }}
                        />
                        <div className="admin-project-tile-edit-actions">
                          <button
                            type="button"
                            onClick={() => handleUpdateDescription(p.id)}
                            disabled={savingId === p.id}
                            className="admin-btn admin-btn--success"
                          >
                            {savingId === p.id ? 'Zapisywanie…' : 'Zapisz'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditDescription}
                            disabled={savingId === p.id}
                            className="admin-btn"
                          >
                            Anuluj
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {p.description ? (
                          <p className="admin-project-tile-desc">
                            {p.description}
                          </p>
                        ) : (
                          <p className="admin-project-tile-desc admin-empty-msg">
                            Brak opisu
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => startEditDescription(p)}
                          className="admin-btn admin-btn--sm admin-project-tile-edit-btn"
                          title="Edytuj opis"
                        >
                          <i className="las la-pen" aria-hidden /> Opis
                        </button>
                        {groups.length > 0 && (
                          <div style={{ marginTop: '8px' }}>
                            <label htmlFor={`group-${p.id}`} style={{ fontSize: '12px', color: '#666', marginRight: '6px' }}>
                              Przenieś do:
                            </label>
                            <select
                              id={`group-${p.id}`}
                              value={p.groupId ?? ''}
                              onChange={(e) => handleGroupChange(p.id, e.target.value)}
                              disabled={updatingGroupId === p.id}
                              style={{
                                fontSize: '12px',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                border: '1px solid #d1d5db',
                              }}
                            >
                              <option value="">— globalne —</option>
                              {groups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                </option>
                              ))}
                            </select>
                            {updatingGroupId === p.id && <span style={{ fontSize: '11px', marginLeft: '4px' }}>⏳</span>}
                            <div style={{ marginTop: '4px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <label htmlFor={`copy-${p.id}`} style={{ fontSize: '12px', color: '#666' }}>
                                Kopiuj do:
                              </label>
                              <select
                                id={`copy-${p.id}`}
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) handleCopyProject(p.id, e.target.value === '__global__' ? '' : e.target.value);
                                }}
                                disabled={copyingId === p.id}
                                style={{
                                  fontSize: '12px',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  border: '1px solid #d1d5db',
                                }}
                              >
                                <option value="">wybierz…</option>
                                <option value="__global__">— globalne —</option>
                                {groups.filter((g) => g.id !== p.groupId).map((g) => (
                                  <option key={g.id} value={g.id}>
                                    {g.name}
                                  </option>
                                ))}
                              </select>
                              {copyingId === p.id && <span style={{ fontSize: '11px' }}>⏳</span>}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    <span className="admin-project-tile-date">
                      {p.createdAt
                        ? new Date(p.createdAt).toLocaleDateString('pl-PL', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })
                        : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id, p.groupId)}
                    disabled={deletingId === p.id || editingId === p.id}
                    className="admin-btn admin-btn--danger-sm admin-project-tile-delete"
                    title="Usuń projekt"
                  >
                    {deletingId === p.id ? (
                      '…'
                    ) : (
                      <i className="las la-trash-alt" aria-hidden />
                    )}
                  </button>
                </div>
              );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
};

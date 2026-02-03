import React, { useState, useEffect } from 'react';
import { logger } from '@/src/utils/logger';
import type { Project } from '@/src/utils/projectsStorage';

export interface ProjectsSectionProps {
  isExpanded: boolean;
  onToggleSection: () => void;
}

export const ProjectsSection: React.FC<ProjectsSectionProps> = ({
  isExpanded,
  onToggleSection,
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

  const handleDelete = async (id: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten projekt?')) return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/admin/projects/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
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
              {projects.map((p) => (
                <div key={p.id} className="admin-project-tile">
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
                    onClick={() => handleDelete(p.id)}
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
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};

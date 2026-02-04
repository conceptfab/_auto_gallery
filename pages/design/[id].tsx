import React, { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import LoadingOverlay from '@/src/components/LoadingOverlay';
import { useStatsTracker } from '@/src/hooks/useStatsTracker';

interface AuthStatus {
  isLoggedIn: boolean;
  email: string | null;
  isAdmin: boolean;
}

interface Revision {
  id: string;
  label?: string;
  description?: string;
  embedUrl?: string;
  thumbnailPath?: string;
  thumbnailDataUrl?: string;
  screenshotDataUrl?: string;
  galleryPaths?: string[];
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  revisions?: Revision[];
}

const DesignProjectPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const { trackDesignView } = useStatsTracker();
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(true);
  const [addingRevision, setAddingRevision] = useState(false);
  const [editingRevision, setEditingRevision] = useState<Revision | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editEmbedUrl, setEditEmbedUrl] = useState('');
  const [savingRevisionId, setSavingRevisionId] = useState<string | null>(null);
  const [fullscreenEmbedUrl, setFullscreenEmbedUrl] = useState<string | null>(
    null
  );
  const [fullscreenLabel, setFullscreenLabel] = useState<string>('');
  const fullscreenIframeRef = useRef<HTMLIFrameElement>(null);
  const [deletingRevisionId, setDeletingRevisionId] = useState<string | null>(
    null
  );
  const [draggedRevisionId, setDraggedRevisionId] = useState<string | null>(
    null
  );
  const [dragOverRevisionId, setDragOverRevisionId] = useState<string | null>(
    null
  );
  const [reordering, setReordering] = useState(false);
  const [showGalleryForRevision, setShowGalleryForRevision] =
    useState<Revision | null>(null);
  /** Indeks obrazu w galerii wyświetlanego w widoku pojedynczego (jak w galerii Content). */
  const [selectedGalleryImageIndex, setSelectedGalleryImageIndex] = useState<
    number | null
  >(null);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const response = await fetch('/api/auth/status');
        const status: AuthStatus = await response.json();
        setAuthStatus(status);
        if (!status.isLoggedIn) {
          router.push('/login');
          return;
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    checkAuthStatus();
  }, [router]);

  useEffect(() => {
    if (!authStatus?.isLoggedIn || !id || typeof id !== 'string') return;
    const fetchProject = async () => {
      try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        if (data.success && Array.isArray(data.projects)) {
          const found = data.projects.find((p: Project) => p.id === id);
          setProject(found ?? null);
        }
      } catch (error) {
        console.error('Error fetching project:', error);
      } finally {
        setProjectLoading(false);
      }
    };
    setProjectLoading(true);
    fetchProject();
  }, [authStatus?.isLoggedIn, id]);

  useEffect(() => {
    if (!project || !id || typeof id !== 'string') return;
    trackDesignView('design_project', `design/${id}`, project.name, {
      projectId: id,
      projectName: project.name,
    });
  }, [project, id, trackDesignView]);

  const handleAddRevision = async () => {
    if (!id || typeof id !== 'string') return;
    setAddingRevision(true);
    try {
      const res = await fetch('/api/admin/projects/add-revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      });
      const data = await res.json();
      if (data.success) {
        await refreshProject();
      } else {
        alert(data.error || 'Błąd dodawania rewizji');
      }
    } catch (error) {
      console.error('Error adding revision', error);
      alert('Błąd dodawania rewizji');
    } finally {
      setAddingRevision(false);
    }
  };

  const refreshProject = async () => {
    if (!id || typeof id !== 'string') return;
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.success && Array.isArray(data.projects)) {
        const found = data.projects.find((p: Project) => p.id === id);
        setProject(found ?? null);
      }
    } catch (error) {
      console.error('Error fetching project:', error);
    }
  };

  const openEditRevision = (rev: Revision) => {
    setEditingRevision(rev);
    setEditLabel(rev.label ?? '');
    setEditDescription(rev.description ?? '');
    setEditEmbedUrl(rev.embedUrl ?? '');
  };

  const closeEditRevision = () => {
    setEditingRevision(null);
    setEditLabel('');
    setEditDescription('');
    setEditEmbedUrl('');
  };

  const handleSaveRevision = async () => {
    if (!id || typeof id !== 'string' || !editingRevision) return;
    setSavingRevisionId(editingRevision.id);
    try {
      const res = await fetch('/api/admin/projects/update-revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          revisionId: editingRevision.id,
          label: editLabel.trim() || undefined,
          description: editDescription.trim() || undefined,
          embedUrl:
            editEmbedUrl.trim() === '' ? '' : editEmbedUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        closeEditRevision();
        await refreshProject();
      } else {
        alert(data.error || 'Błąd zapisywania');
      }
    } catch (error) {
      console.error('Error saving revision', error);
      alert('Błąd zapisywania');
    } finally {
      setSavingRevisionId(null);
    }
  };

  const getGalleryImageUrl = (relativePath: string) =>
    `/api/projects/gallery/${relativePath}`;

  const getRevisionThumbnail = (rev: Revision): string | undefined => {
    if (id && typeof id === 'string' && rev.thumbnailPath) {
      return `/api/projects/thumbnail/${id}/${rev.id}`;
    }
    if (rev.thumbnailDataUrl || rev.screenshotDataUrl) {
      return rev.thumbnailDataUrl || rev.screenshotDataUrl;
    }
    if (rev.galleryPaths?.length) {
      return getGalleryImageUrl(rev.galleryPaths[0]);
    }
    return undefined;
  };

  const handleRemoveThumbnail = async () => {
    if (!id || typeof id !== 'string' || !editingRevision) return;
    try {
      const res = await fetch('/api/admin/projects/update-revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          revisionId: editingRevision.id,
          thumbnailDataUrl: '',
          screenshotDataUrl: '',
        }),
      });
      const data = await res.json();
      if (data.success) {
        await refreshProject();
        setEditingRevision((prev) =>
          prev
            ? {
                ...prev,
                thumbnailDataUrl: undefined,
                screenshotDataUrl: undefined,
              }
            : null
        );
      } else alert(data.error || 'Błąd usuwania miniaturki');
    } catch (error) {
      console.error('Error removing thumbnail', error);
      alert('Błąd usuwania miniaturki');
    }
  };

  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [uploadingGallery, setUploadingGallery] = useState(false);

  const handleGalleryFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !id || typeof id !== 'string' || !editingRevision) {
      e.target.value = '';
      return;
    }
    const imageFiles = Array.from(files).filter((f) =>
      ['image/jpeg', 'image/png', 'image/webp'].includes(f.type)
    );
    if (imageFiles.length === 0) {
      alert('Wybierz pliki obrazów (JPEG, PNG lub WebP).');
      e.target.value = '';
      return;
    }
    setUploadingGallery(true);
    try {
      const dataUrls: string[] = [];
      for (const file of imageFiles) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = dataUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(img, 0, 0);
        dataUrls.push(canvas.toDataURL('image/webp', 0.85));
      }
      if (dataUrls.length === 0) {
        alert('Nie udało się przetworzyć obrazów.');
        return;
      }
      const res = await fetch('/api/admin/projects/upload-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          revisionId: editingRevision.id,
          images: dataUrls,
        }),
      });
      const data = await res.json();
      if (data.success && data.revision) {
        await refreshProject();
        setEditingRevision((prev) =>
          prev ? { ...prev, galleryPaths: data.revision.galleryPaths } : null
        );
      } else {
        alert(data.error || 'Błąd dodawania do galerii');
      }
    } catch (err) {
      console.error('Error uploading gallery', err);
      alert('Błąd przesyłania plików');
    } finally {
      setUploadingGallery(false);
      e.target.value = '';
    }
  };

  const handleAddThumbnail = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || typeof id !== 'string' || !editingRevision) return;
    const type = file.type.toLowerCase();
    if (
      !type.startsWith('image/') ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(type)
    ) {
      alert('Wybierz plik obrazu: JPEG, PNG lub WebP.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          alert('Błąd konwersji obrazu.');
          return;
        }
        ctx.drawImage(img, 0, 0);
        const webpDataUrl = canvas.toDataURL('image/webp', 0.85);
        const revId = editingRevision.id;
        fetch('/api/admin/projects/update-revision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: id,
            revisionId: revId,
            thumbnailDataUrl: webpDataUrl,
            screenshotDataUrl: '',
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.success && data.revision) {
              refreshProject().then(() => {
                setEditingRevision((prev) =>
                  prev
                    ? {
                        ...prev,
                        thumbnailPath: data.revision.thumbnailPath,
                        thumbnailDataUrl: undefined,
                        screenshotDataUrl: undefined,
                      }
                    : null
                );
              });
            } else alert(data.error || 'Błąd dodawania miniaturki');
          })
          .catch((err) => {
            console.error('Error adding thumbnail', err);
            alert('Błąd dodawania miniaturki');
          });
      };
      img.onerror = () => alert('Nie udało się wczytać obrazu.');
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const openFullscreenEmbed = (url: string, label: string) => {
    setFullscreenEmbedUrl(url);
    setFullscreenLabel(label);
  };

  const closeFullscreenEmbed = () => {
    setFullscreenEmbedUrl(null);
    setFullscreenLabel('');
  };

  // Po otwarciu fullscreen daj fokus iframe, żeby skróty klawiszowe szły do osadzonej strony
  useEffect(() => {
    if (!fullscreenEmbedUrl) return;
    const t = setTimeout(() => {
      fullscreenIframeRef.current?.focus();
    }, 300);
    return () => clearTimeout(t);
  }, [fullscreenEmbedUrl]);

  // Escape zamyka overlay (działa gdy focus jest poza iframe)
  useEffect(() => {
    if (!fullscreenEmbedUrl) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeFullscreenEmbed();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fullscreenEmbedUrl]);

  useEffect(() => {
    if (!showGalleryForRevision) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowGalleryForRevision(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showGalleryForRevision]);

  const handleDeleteRevision = async (rev: Revision) => {
    if (!id || typeof id !== 'string') return;
    if (!confirm(`Usunąć rewizję "${rev.label || rev.id.slice(0, 8)}"?`))
      return;
    setDeletingRevisionId(rev.id);
    try {
      const res = await fetch('/api/admin/projects/delete-revision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, revisionId: rev.id }),
      });
      const data = await res.json();
      if (data.success) await refreshProject();
      else alert(data.error || 'Błąd usuwania rewizji');
    } catch (error) {
      console.error('Error deleting revision', error);
      alert('Błąd usuwania rewizji');
    } finally {
      setDeletingRevisionId(null);
    }
  };

  const handleRevisionDragStart = (e: React.DragEvent, revId: string) => {
    setDraggedRevisionId(revId);
    e.dataTransfer.setData('text/plain', revId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleRevisionDragOver = (e: React.DragEvent, revId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverRevisionId(revId);
  };

  const handleRevisionDragLeave = () => {
    setDragOverRevisionId(null);
  };

  const handleRevisionDrop = async (
    e: React.DragEvent,
    dropTargetId: string
  ) => {
    e.preventDefault();
    setDragOverRevisionId(null);
    setDraggedRevisionId(null);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (
      !draggedId ||
      draggedId === dropTargetId ||
      !id ||
      typeof id !== 'string' ||
      !project?.revisions
    )
      return;
    const revs = project.revisions;
    const fromIdx = revs.findIndex((r) => r.id === draggedId);
    const toIdx = revs.findIndex((r) => r.id === dropTargetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newRevisions = [...revs];
    const [removed] = newRevisions.splice(fromIdx, 1);
    newRevisions.splice(toIdx, 0, removed);
    const revisionIds = newRevisions.map((r) => r.id);
    setReordering(true);
    try {
      const res = await fetch('/api/admin/projects/reorder-revisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, revisionIds }),
      });
      const data = await res.json();
      if (data.success) await refreshProject();
      else alert(data.error || 'Błąd zmiany kolejności');
    } catch (error) {
      console.error('Error reordering', error);
      alert('Błąd zmiany kolejności');
    } finally {
      setReordering(false);
    }
  };

  const handleRevisionDragEnd = () => {
    setDraggedRevisionId(null);
    setDragOverRevisionId(null);
  };

  const isEmbedUrlAllowed = (url: string) => {
    try {
      const u = new URL(url);
      return (
        u.protocol === 'https:' &&
        (u.hostname === 'share.plasticity.xyz' ||
          u.hostname.endsWith('.plasticity.xyz'))
      );
    } catch {
      return false;
    }
  };

  if (loading) {
    return <LoadingOverlay message="Sprawdzanie autoryzacji..." />;
  }

  if (!authStatus?.isLoggedIn) {
    return null;
  }

  if (projectLoading) {
    return (
      <>
        <Head>
          <title>Projekt – CONCEPTFAB Content Browser</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <main className="design-page">
          <p className="design-page-loading">Ładowanie projektu...</p>
        </main>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <Head>
          <title>Projekt nie znaleziony – CONCEPTFAB Content Browser</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <main className="design-page">
          <p className="design-page-empty">Projekt nie znaleziony.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{project.name} – CONCEPTFAB Content Browser</title>
        <meta
          name="description"
          content={project.description || project.name}
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="design-page">
        <nav
          className="design-breadcrumbs"
          aria-label="Nawigacja okruszkowa dla projektów"
        >
          <button
            type="button"
            className="design-breadcrumbs-link"
            onClick={() => router.push('/projekty')}
          >
            Projekty
          </button>
          <span className="design-breadcrumbs-separator">/</span>
          <span className="design-breadcrumbs-current">{project.name}</span>
        </nav>
        <div className="design-page-header-row">
          <div className="design-page-header-left">
            <h1 className="design-page-title">{project.name}</h1>
            {project.description && (
              <p className="design-project-desc">{project.description}</p>
            )}
          </div>
          {authStatus.isAdmin && (
            <div className="design-project-admin-actions">
              <button
                type="button"
                onClick={handleAddRevision}
                disabled={addingRevision}
                className="design-add-revision-btn"
              >
                {addingRevision ? 'Dodawanie…' : 'Dodaj rewizję'}
              </button>
            </div>
          )}
        </div>
        {project.revisions && project.revisions.length > 0 && (
          <section className="design-revisions">
            <h2 className="design-revisions-title">Rewizje</h2>
            <ul className="design-revisions-list">
              {project.revisions.map((rev) => (
                <li
                  key={rev.id}
                  className={`design-revision-card${
                    draggedRevisionId === rev.id
                      ? ' design-revision-card--dragging'
                      : ''
                  }${
                    dragOverRevisionId === rev.id
                      ? ' design-revision-card--drag-over'
                      : ''
                  }`}
                  draggable={authStatus.isAdmin && !reordering}
                  onDragStart={(e) =>
                    authStatus.isAdmin && handleRevisionDragStart(e, rev.id)
                  }
                  onDragOver={(e) =>
                    authStatus.isAdmin && handleRevisionDragOver(e, rev.id)
                  }
                  onDragLeave={handleRevisionDragLeave}
                  onDrop={(e) =>
                    authStatus.isAdmin && handleRevisionDrop(e, rev.id)
                  }
                  onDragEnd={handleRevisionDragEnd}
                  data-revision-id={rev.id}
                >
                  <div className="design-revision-header">
                    <span className="design-revision-label">
                      {rev.label ||
                        `Rewizja ${
                          rev.createdAt
                            ? new Date(rev.createdAt).toLocaleDateString(
                                'pl-PL'
                              )
                            : rev.id.slice(0, 8)
                        }`}
                    </span>
                    <span className="design-revision-date">
                      {rev.createdAt
                        ? new Date(rev.createdAt).toLocaleDateString('pl-PL', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })
                        : ''}
                    </span>
                  </div>
                  {rev.embedUrl && isEmbedUrlAllowed(rev.embedUrl) ? (
                    <div className="design-revision-embed">
                      <button
                        type="button"
                        onClick={() =>
                          openFullscreenEmbed(
                            rev.embedUrl!,
                            rev.label ||
                              `Rewizja ${
                                rev.createdAt
                                  ? new Date(rev.createdAt).toLocaleDateString(
                                      'pl-PL'
                                    )
                                  : rev.id.slice(0, 8)
                              }`
                          )
                        }
                        className="design-revision-fullscreen-btn"
                        title="Pełny ekran"
                        aria-label="Otwórz w pełnym ekranie"
                      >
                        <i className="las la-eye" aria-hidden />
                      </button>
                      {getRevisionThumbnail(rev) ? (
                        <img
                          src={getRevisionThumbnail(rev)}
                          alt={
                            rev.label ||
                            `Miniaturka rewizji ${rev.id.slice(0, 8)}`
                          }
                          className="design-revision-embed-thumbnail"
                        />
                      ) : (
                        <iframe
                          src={rev.embedUrl}
                          title={rev.label || `Rewizja ${rev.id.slice(0, 8)}`}
                          className="design-revision-iframe"
                          allow="fullscreen"
                          allowFullScreen
                        />
                      )}
                    </div>
                  ) : getRevisionThumbnail(rev) ? (
                    <div className="design-revision-embed">
                      <img
                        src={getRevisionThumbnail(rev)}
                        alt={
                          rev.label ||
                          `Miniaturka rewizji ${rev.id.slice(0, 8)}`
                        }
                        className="design-revision-embed-thumbnail"
                      />
                    </div>
                  ) : (
                    <div className="design-revision-embed design-revision-embed-empty">
                      {authStatus.isAdmin ? (
                        <p className="design-revision-no-embed">
                          Brak osadzonej strony. Użyj Edytuj, aby dodać link.
                        </p>
                      ) : (
                        <p className="design-revision-no-embed">
                          Brak podglądu.
                        </p>
                      )}
                    </div>
                  )}
                  {authStatus.isAdmin && (
                    <div className="design-revision-toolbar">
                      <button
                        type="button"
                        onClick={() => openEditRevision(rev)}
                        className="design-revision-toolbar-btn"
                        title="Edytuj rewizję"
                      >
                        <i className="las la-pen" aria-hidden /> Edytuj
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRevision(rev)}
                        disabled={deletingRevisionId === rev.id}
                        className="design-revision-toolbar-btn design-revision-toolbar-btn--danger design-revision-toolbar-delete"
                        title="Usuń rewizję"
                      >
                        {deletingRevisionId === rev.id ? (
                          <span className="design-revision-toolbar-loading">
                            …
                          </span>
                        ) : (
                          <i className="las la-trash-alt" aria-hidden />
                        )}
                      </button>
                    </div>
                  )}
                  <div className="design-revision-description">
                    {rev.description ? (
                      <p className="design-revision-description-text">
                        {rev.description}
                      </p>
                    ) : (
                      <p className="design-revision-description-text design-revision-description-empty">
                        Brak opisu.
                      </p>
                    )}
                  </div>
                  <div className="design-revision-footer">
                    <div className="design-revision-footer-left">
                      {rev.galleryPaths && rev.galleryPaths.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setShowGalleryForRevision(rev)}
                          className="design-revision-open-link design-revision-gallery-btn"
                        >
                          Pokaż galerię
                          <i className="las la-images" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                    <div className="design-revision-footer-right">
                      {rev.embedUrl && isEmbedUrlAllowed(rev.embedUrl) && (
                        <a
                          href={rev.embedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="design-revision-open-link"
                        >
                          Otwórz scene 3D w nowej karcie
                          <i className="las la-external-link-alt" aria-hidden />
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {editingRevision && (
          <div
            className="design-edit-modal-overlay"
            onClick={closeEditRevision}
            role="dialog"
            aria-modal="true"
            aria-labelledby="design-edit-modal-title"
          >
            <div
              className="design-edit-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                id="design-edit-modal-title"
                className="design-edit-modal-title"
              >
                Edycja rewizji
              </h3>
              <div className="design-edit-modal-form">
                <label className="design-edit-modal-label">
                  Nazwa rewizji
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="np. Wersja 1"
                    className="admin-input"
                  />
                </label>
                <label className="design-edit-modal-label">
                  Opis rewizji
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Opis rewizji…"
                    className="admin-input design-edit-modal-description"
                    rows={4}
                  />
                </label>
                <label className="design-edit-modal-label">
                  Link do osadzonej strony
                  <input
                    type="url"
                    value={editEmbedUrl}
                    onChange={(e) => setEditEmbedUrl(e.target.value)}
                    placeholder="https://share.plasticity.xyz/r/..."
                    className="admin-input"
                  />
                </label>
                <div className="design-edit-modal-gallery-action">
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleGalleryFiles}
                    style={{ display: 'none' }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    disabled={uploadingGallery || !editingRevision}
                    className="design-revision-toolbar-btn"
                    title="Wybierz pliki obrazów (JPEG, PNG, WebP) i dodaj do galerii rewizji"
                  >
                    {uploadingGallery
                      ? 'Przesyłanie…'
                      : 'Utwórz galerię (wybierz pliki)'}
                  </button>
                  {editingRevision?.galleryPaths?.length ? (
                    <span className="design-edit-modal-gallery-count">
                      W galerii: {editingRevision.galleryPaths.length} obrazów
                    </span>
                  ) : null}
                </div>
                <div className="design-edit-modal-thumbnail">
                  <span className="design-edit-modal-label">Miniaturka</span>
                  {editingRevision && getRevisionThumbnail(editingRevision) && (
                    <div className="design-edit-modal-thumbnail-preview">
                      <img
                        src={getRevisionThumbnail(editingRevision)}
                        alt="Miniaturka"
                        className="design-edit-modal-thumbnail-img"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveThumbnail}
                        className="design-revision-toolbar-btn design-revision-toolbar-btn--danger"
                      >
                        Usuń miniaturkę
                      </button>
                    </div>
                  )}
                  <input
                    ref={thumbnailInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={handleAddThumbnail}
                    style={{ display: 'none' }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    onClick={() => thumbnailInputRef.current?.click()}
                    className="design-revision-toolbar-btn"
                  >
                    Dodaj miniaturkę (JPEG, PNG, WebP)
                  </button>
                </div>
              </div>
              <div className="design-edit-modal-actions">
                <button
                  type="button"
                  onClick={closeEditRevision}
                  className="admin-btn"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={handleSaveRevision}
                  disabled={savingRevisionId === editingRevision.id}
                  className="admin-btn admin-btn--success"
                >
                  {savingRevisionId === editingRevision.id
                    ? 'Zapisywanie…'
                    : 'Zapisz'}
                </button>
              </div>
            </div>
          </div>
        )}

        {fullscreenEmbedUrl && (
          <div
            className="design-fullscreen-overlay"
            onClick={closeFullscreenEmbed}
            role="dialog"
            aria-modal="true"
            aria-label="Podgląd w pełnym ekranie"
          >
            <div
              className="design-fullscreen-inner"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="design-fullscreen-header">
                <span className="design-fullscreen-title">
                  {fullscreenLabel}
                </span>
                <span className="design-fullscreen-hint">
                  Kliknij w podgląd poniżej, aby skróty klawiszowe działały w
                  osadzonej stronie. Esc — zamknij.
                </span>
                <button
                  type="button"
                  onClick={closeFullscreenEmbed}
                  className="design-fullscreen-close"
                  aria-label="Zamknij"
                >
                  <i className="las la-times" aria-hidden />
                </button>
              </div>
              <iframe
                ref={fullscreenIframeRef}
                src={fullscreenEmbedUrl}
                title={fullscreenLabel}
                className="design-fullscreen-iframe"
                allow="fullscreen"
                allowFullScreen
                tabIndex={0}
              />
            </div>
          </div>
        )}

        {showGalleryForRevision && id && typeof id === 'string' && (
          <div
            className="design-gallery-overlay"
            onClick={() => {
              setShowGalleryForRevision(null);
              setSelectedGalleryImageIndex(null);
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Galeria rewizji"
          >
            <div
              className={`design-gallery-inner${
                selectedGalleryImageIndex !== null
                  ? ' design-gallery-inner--single'
                  : ''
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="design-gallery-header">
                <span className="design-gallery-title">
                  Galeria:{' '}
                  {showGalleryForRevision.label ||
                    `Rewizja ${showGalleryForRevision.id.slice(0, 8)}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowGalleryForRevision(null);
                    setSelectedGalleryImageIndex(null);
                  }}
                  className="design-fullscreen-close"
                  aria-label="Zamknij"
                >
                  <i className="las la-times" aria-hidden />
                </button>
              </div>
              {selectedGalleryImageIndex !== null &&
              showGalleryForRevision.galleryPaths?.length ? (
                <div className="design-gallery-single">
                  <button
                    type="button"
                    className="modal-nav-button modal-nav-button-left"
                    onClick={(e) => {
                      e.stopPropagation();
                      const paths = showGalleryForRevision.galleryPaths!;
                      setSelectedGalleryImageIndex(
                        (selectedGalleryImageIndex - 1 + paths.length) %
                          paths.length
                      );
                    }}
                    title="Poprzedni obraz"
                  >
                    <i className="las la-angle-left" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="modal-nav-button modal-nav-button-right"
                    onClick={(e) => {
                      e.stopPropagation();
                      const paths = showGalleryForRevision.galleryPaths!;
                      setSelectedGalleryImageIndex(
                        (selectedGalleryImageIndex + 1) % paths.length
                      );
                    }}
                    title="Następny obraz"
                  >
                    <i className="las la-angle-right" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="close-button design-gallery-single-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedGalleryImageIndex(null);
                    }}
                    title="Wróć do siatki"
                  >
                    <i className="las la-times" aria-hidden />
                  </button>
                  <div className="modal-image-wrapper">
                    <img
                      src={getGalleryImageUrl(
                        showGalleryForRevision.galleryPaths[
                          selectedGalleryImageIndex
                        ]
                      )}
                      alt=""
                      className="modal-image"
                    />
                  </div>
                  <div className="modal-info">
                    <span className="design-gallery-single-counter">
                      {selectedGalleryImageIndex + 1} /{' '}
                      {showGalleryForRevision.galleryPaths.length}
                    </span>
                  </div>
                  <a
                    href={getGalleryImageUrl(
                      showGalleryForRevision.galleryPaths[
                        selectedGalleryImageIndex
                      ]
                    )}
                    download
                    className="design-gallery-single-download"
                    title="Pobierz"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <i className="las la-download" aria-hidden />
                  </a>
                </div>
              ) : (
                <div className="design-gallery-grid">
                  {showGalleryForRevision.galleryPaths?.map(
                    (relativePath, idx) => (
                      <button
                        key={relativePath}
                        type="button"
                        className="design-gallery-grid-item"
                        onClick={() => setSelectedGalleryImageIndex(idx)}
                      >
                        <img
                          src={getGalleryImageUrl(relativePath)}
                          alt=""
                          className="design-gallery-img"
                        />
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
};

export default DesignProjectPage;

export async function getServerSideProps() {
  return {
    props: {},
  };
}

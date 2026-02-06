import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@/src/utils/logger';

interface MoodboardBoardInfo {
  id: string;
  name?: string;
  imagesCount: number;
}

interface RevisionInfo {
  id: string;
  label?: string;
  thumbnailPresent: boolean;
  galleryCount: number;
}

interface ProjectTreeItem {
  id: string;
  name: string;
  slug?: string;
  revisions: RevisionInfo[];
}

interface DataStorageTree {
  moodboard: { boards: MoodboardBoardInfo[] };
  projects: ProjectTreeItem[];
}

interface VerifyRepairReport {
  success: boolean;
  repaired: { projects: number; revisions: number; galleryPaths: number };
  adopted: { revisionDirs: string[]; galleryFiles: string[] };
  orphans: { projectDirs: string[]; revisionDirs: string[] };
  errors: string[];
}

export const DataStorageSection: React.FC = () => {
  const [tree, setTree] = useState<DataStorageTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState<string | null>(null);
  const [verifyRepairLoading, setVerifyRepairLoading] = useState(false);
  const [verifyRepairReport, setVerifyRepairReport] = useState<VerifyRepairReport | null>(null);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/data-storage/tree', { credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Błąd ładowania');
        setTree(null);
        return;
      }
      setTree(data);
    } catch (err) {
      logger.error('Data storage tree fetch error', err);
      setError('Błąd połączenia');
      setTree(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const handleVerifyRepair = async () => {
    setVerifyRepairReport(null);
    setVerifyRepairLoading(true);
    try {
      const res = await fetch('/api/admin/data-storage/verify-repair', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const data: VerifyRepairReport = await res.json();
      setVerifyRepairReport(data);
      if (data.success && (data.repaired.projects > 0 || data.repaired.revisions > 0 || data.adopted.revisionDirs.length > 0 || data.adopted.galleryFiles.length > 0)) {
        await fetchTree();
      }
    } catch (err) {
      logger.error('Verify-repair error', err);
      setVerifyRepairReport({
        success: false,
        repaired: { projects: 0, revisions: 0, galleryPaths: 0 },
        adopted: { revisionDirs: [], galleryFiles: [] },
        orphans: { projectDirs: [], revisionDirs: [] },
        errors: ['Błąd połączenia'],
      });
    } finally {
      setVerifyRepairLoading(false);
    }
  };

  const handleBackup = async (scope: 'all' | 'moodboard' | 'projects') => {
    setBackupLoading(scope);
    try {
      const res = await fetch(`/api/admin/data-storage/backup?scope=${scope}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Błąd pobierania backupu');
        return;
      }
      const blob = await res.blob();
      const disp = res.headers.get('Content-Disposition');
      const match = disp && /filename\*?=(?:UTF-8'')?([^;]+)/i.exec(disp);
      const name = match ? decodeURIComponent(match[1].replace(/^["']|["']$/g, '')) : `backup-${scope}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('Backup download error', err);
      alert('Błąd pobierania backupu');
    } finally {
      setBackupLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="admin-form-box" style={{ padding: '24px', textAlign: 'center', color: '#666' }}>
        Ładowanie hierarchii danych...
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-form-box" style={{ padding: '24px', color: '#b91c1c', backgroundColor: '#fef2f2', border: '1px solid #ef4444', borderRadius: '6px' }}>
        {error}
        <button type="button" onClick={fetchTree} className="admin-btn" style={{ marginTop: '12px' }}>
          Odśwież
        </button>
      </div>
    );
  }

  return (
    <div className="admin-form-box">
      <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
        Hierarchia projektów i moodboardów zapisanych w <code>/data-storage</code>. Weryfikacja dopasowuje pliki do rodziców i naprawia brakujące wpisy. Backup pobiera archiwum ZIP.
      </p>

      <div style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <button
          type="button"
          className="admin-btn"
          disabled={verifyRepairLoading}
          onClick={handleVerifyRepair}
          title="Skanuje projects/, znajduje sieroty (katalogi bez wpisu w project.json/revision.json), weryfikuje rodziców i naprawia brakujące wpisy"
        >
          <i className="las la-tools" style={{ marginRight: '6px' }} />
          {verifyRepairLoading ? 'Weryfikacja...' : 'Weryfikuj i napraw'}
        </button>
      </div>

      {verifyRepairReport && (
        <div
          style={{
            marginBottom: '20px',
            padding: '14px',
            borderRadius: '6px',
            border: `1px solid ${verifyRepairReport.success ? '#10b981' : '#ef4444'}`,
            backgroundColor: verifyRepairReport.success ? '#ecfdf5' : '#fef2f2',
            fontSize: '14px',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '8px' }}>
            {verifyRepairReport.success ? 'Weryfikacja zakończona' : 'Weryfikacja z błędami'}
          </strong>
          <div style={{ marginBottom: '6px' }}>
            Naprawiono: {verifyRepairReport.repaired.projects} projektów, {verifyRepairReport.repaired.revisions} rewizji, {verifyRepairReport.repaired.galleryPaths} wpisów galerii.
          </div>
          {verifyRepairReport.adopted.revisionDirs.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              Przyjęte katalogi rewizji (dopasowane do projektu): {verifyRepairReport.adopted.revisionDirs.length} — {verifyRepairReport.adopted.revisionDirs.slice(0, 3).join(', ')}
              {verifyRepairReport.adopted.revisionDirs.length > 3 ? '…' : ''}
            </div>
          )}
          {verifyRepairReport.adopted.galleryFiles.length > 0 && (
            <div style={{ marginBottom: '6px' }}>
              Przyjęte pliki galerii (dopasowane do rewizji): {verifyRepairReport.adopted.galleryFiles.length}
            </div>
          )}
          {verifyRepairReport.orphans.projectDirs.length > 0 && (
            <div style={{ marginBottom: '6px', color: '#b91c1c' }}>
              Katalogi projektów bez project.json: {verifyRepairReport.orphans.projectDirs.join(', ')}
            </div>
          )}
          {verifyRepairReport.errors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: '18px', color: '#b91c1c' }}>
              {verifyRepairReport.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, marginRight: '8px' }}>Backup:</span>
        <button
          type="button"
          className="admin-btn"
          disabled={!!backupLoading}
          onClick={() => handleBackup('all')}
        >
          {backupLoading === 'all' ? 'Pobieranie...' : 'Wszystko (ZIP)'}
        </button>
        <button
          type="button"
          className="admin-btn"
          disabled={!!backupLoading}
          onClick={() => handleBackup('moodboard')}
        >
          {backupLoading === 'moodboard' ? 'Pobieranie...' : 'Tylko moodboard'}
        </button>
        <button
          type="button"
          className="admin-btn"
          disabled={!!backupLoading}
          onClick={() => handleBackup('projects')}
        >
          {backupLoading === 'projects' ? 'Pobieranie...' : 'Tylko projekty'}
        </button>
        <button type="button" onClick={fetchTree} className="admin-btn" style={{ marginLeft: 'auto' }}>
          <i className="las la-sync" style={{ marginRight: '6px' }} />
          Odśwież
        </button>
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#fafafa' }}>
        <div style={{ padding: '12px 16px', backgroundColor: '#f3f4f6', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>
          /data-storage
        </div>

        {tree?.moodboard?.boards?.length ? (
          <div style={{ borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ padding: '10px 16px', backgroundColor: '#eff6ff', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="las la-th-large" style={{ color: '#2563eb' }} />
              moodboard/
            </div>
            <ul style={{ margin: 0, paddingLeft: '24px', paddingBottom: '8px', listStyle: 'none' }}>
              {tree.moodboard.boards.map((board) => (
                <li key={board.id} style={{ padding: '6px 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#6b7280' }}>—</span>
                  <span>{board.name || board.id}</span>
                  <span style={{ color: '#6b7280', fontSize: '12px' }}>
                    ({board.imagesCount} {board.imagesCount === 1 ? 'obraz' : 'obrazów'})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tree?.projects?.length ? (
          <div>
            <div style={{ padding: '10px 16px', backgroundColor: '#f0fdf4', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="las la-folder" style={{ color: '#16a34a' }} />
              projects/
            </div>
            <ul style={{ margin: 0, paddingLeft: '24px', paddingBottom: '12px', listStyle: 'none' }}>
              {tree.projects.map((project) => (
                <li key={project.id} style={{ padding: '8px 0', fontSize: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                    <span style={{ color: '#6b7280' }}>—</span>
                    {project.name}
                    {project.slug ? <span style={{ color: '#9ca3af', fontSize: '12px' }}>({project.slug})</span> : null}
                  </div>
                  {project.revisions?.length ? (
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px', listStyle: 'none', color: '#6b7280', fontSize: '13px' }}>
                      <li style={{ padding: '2px 0' }}>rewizje/</li>
                      {project.revisions.map((rev) => (
                        <li key={rev.id} style={{ padding: '2px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>— {rev.label || rev.id.slice(0, 8)}</span>
                          {rev.thumbnailPresent && <span title="Miniaturka">🖼</span>}
                          <span>(galeria: {rev.galleryCount})</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ paddingLeft: '20px', color: '#9ca3af', fontSize: '12px' }}>Brak rewizji</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {tree && !tree.moodboard?.boards?.length && !tree.projects?.length ? (
          <div style={{ padding: '16px', color: '#6b7280', fontSize: '14px' }}>
            Brak danych moodboard ani projektów w nowej strukturze. Uruchom skrypt migracji jeśli masz stare dane.
          </div>
        ) : null}
      </div>
    </div>
  );
};

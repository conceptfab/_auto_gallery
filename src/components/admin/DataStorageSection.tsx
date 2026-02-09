import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@/src/utils/logger';

interface MoodboardBoardInfo {
  id: string;
  name?: string;
  imagesCount: number;
  sketchesCount?: number;
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

interface GroupTreeItem {
  groupId: string;
  groupName: string;
  moodboard: { boards: MoodboardBoardInfo[] };
  projects: ProjectTreeItem[];
}

interface DataStorageTree {
  moodboard: { boards: MoodboardBoardInfo[] };
  projects: ProjectTreeItem[];
  groups?: GroupTreeItem[];
}

interface VerifyRepairReport {
  success: boolean;
  repaired: { projects: number; revisions: number; galleryPaths: number };
  adopted: { revisionDirs: string[]; galleryFiles: string[] };
  orphans: { projectDirs: string[]; revisionDirs: string[] };
  errors: string[];
}

interface AutoBackupSettings {
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  autoBackupMaxFiles: number;
}

interface BackupFileInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const DataStorageSection: React.FC = () => {
  const [tree, setTree] = useState<DataStorageTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState<string | null>(null);
  const [verifyRepairLoading, setVerifyRepairLoading] = useState(false);
  const [verifyRepairReport, setVerifyRepairReport] = useState<VerifyRepairReport | null>(null);
  const [selectedBoardIds, setSelectedBoardIds] = useState<Set<string>>(new Set());
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreNewName, setRestoreNewName] = useState('');
  const [restoreToGroupId, setRestoreToGroupId] = useState<string>('');
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreConflict, setRestoreConflict] = useState<{ type: string; existingId?: string } | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // Auto-backup state
  const [abSettings, setAbSettings] = useState<AutoBackupSettings>({
    autoBackupEnabled: false,
    autoBackupIntervalHours: 24,
    autoBackupMaxFiles: 7,
  });
  const [abBackups, setAbBackups] = useState<BackupFileInfo[]>([]);
  const [abLoading, setAbLoading] = useState(true);
  const [abSaving, setAbSaving] = useState(false);
  const [abTriggering, setAbTriggering] = useState(false);
  const [abMessage, setAbMessage] = useState<string | null>(null);

  const toggleBoard = (id: string) => {
    setSelectedBoardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleProject = (id: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const hasSelection = selectedBoardIds.size > 0 || selectedProjectIds.size > 0;

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

  const fetchAutoBackup = useCallback(async () => {
    setAbLoading(true);
    try {
      const res = await fetch('/api/admin/data-storage/auto-backup', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        setAbSettings(data.settings);
        setAbBackups(data.backups || []);
      }
    } catch (err) {
      logger.error('Auto-backup fetch error', err);
    } finally {
      setAbLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
    fetchAutoBackup();
  }, [fetchTree, fetchAutoBackup]);

  const handleAbSettingsUpdate = async (updates: Partial<AutoBackupSettings>) => {
    setAbSaving(true);
    try {
      const res = await fetch('/api/admin/data-storage/auto-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setAbSettings(data.settings);
      }
    } catch (err) {
      logger.error('Auto-backup settings update error', err);
    } finally {
      setAbSaving(false);
    }
  };

  const handleAbTrigger = async () => {
    setAbTriggering(true);
    setAbMessage(null);
    try {
      const res = await fetch('/api/admin/data-storage/auto-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'trigger' }),
      });
      const data = await res.json();
      if (res.ok) {
        setAbMessage(`Backup utworzony: ${data.file} (${formatBytes(data.sizeBytes)})`);
        await fetchAutoBackup();
      } else {
        setAbMessage(`Błąd: ${data.error || 'Nieznany'}`);
      }
    } catch (err) {
      logger.error('Auto-backup trigger error', err);
      setAbMessage('Błąd połączenia');
    } finally {
      setAbTriggering(false);
    }
  };

  const handleAbDownload = (name: string) => {
    const url = `/api/admin/data-storage/auto-backup?action=download&file=${encodeURIComponent(name)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
  };

  const handleAbDelete = async (name: string) => {
    if (!confirm(`Usunąć backup ${name}?`)) return;
    try {
      const res = await fetch(`/api/admin/data-storage/auto-backup?file=${encodeURIComponent(name)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (res.ok) {
        setAbBackups((prev) => prev.filter((b) => b.name !== name));
      }
    } catch (err) {
      logger.error('Auto-backup delete error', err);
    }
  };

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

  const handleBackup = async (scope: 'all' | 'moodboard' | 'projects' | 'selected') => {
    const loadingKey = scope === 'selected' ? 'selected' : scope;
    setBackupLoading(loadingKey);
    try {
      let url = `/api/admin/data-storage/backup?scope=${scope}`;
      if (scope === 'selected') {
        if (selectedBoardIds.size) url += `&boardIds=${encodeURIComponent([...selectedBoardIds].join(','))}`;
        if (selectedProjectIds.size) url += `&projectIds=${encodeURIComponent([...selectedProjectIds].join(','))}`;
      }
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Błąd pobierania backupu');
        return;
      }
      const blob = await res.blob();
      const disp = res.headers.get('Content-Disposition');
      const match = disp && /filename\*?=(?:UTF-8'')?([^;]+)/i.exec(disp);
      const name = match ? decodeURIComponent(match[1].replace(/^["']|["']$/g, '')) : `backup-${scope}.zip`;
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = name;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      logger.error('Backup download error', err);
      alert('Błąd pobierania backupu');
    } finally {
      setBackupLoading(null);
    }
  };

  const handleRestore = () => {
    if (!restoreFile) {
      setRestoreError('Wybierz plik ZIP.');
      return;
    }
    setRestoreLoading(true);
    setUploadProgress(0);
    setRestoreConflict(null);
    setRestoreSuccess(null);
    setRestoreError(null);
    const form = new FormData();
    form.append('file', restoreFile);
    if (restoreNewName.trim()) form.append('newName', restoreNewName.trim());
    form.append('restoreToGroupId', restoreToGroupId);
    const xhr = new XMLHttpRequest();
    const timeoutId = setTimeout(() => {
      xhr.abort();
    }, 120_000);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      } else {
        setUploadProgress((prev) => (prev < 90 ? prev + 5 : prev));
      }
    });
    xhr.addEventListener('load', () => {
      clearTimeout(timeoutId);
      setUploadProgress(100);
      const text = xhr.responseText;
      let data: { error?: string; hint?: string; type?: string; message?: string; existingId?: string; debug?: Record<string, unknown> } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        const msg = xhr.status === 200
          ? 'Serwer zwrócił nieprawidłową odpowiedź.'
          : `Serwer zwrócił błąd (nie JSON). Status: ${xhr.status}. ${text.slice(0, 300)}${text.length > 300 ? '…' : ''}`;
        setRestoreError(msg);
        setUploadProgress(0);
        alert('BŁĄD PRZYWRACANIA:\n\n' + msg);
        setRestoreLoading(false);
        return;
      }
      if (xhr.status === 409) {
        setRestoreConflict({ type: data.type || 'unknown', existingId: data.existingId });
        setUploadProgress(0);
        setRestoreLoading(false);
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        let msg = [data.error, data.hint].filter(Boolean).join('\n\n');
        if (!msg) msg = 'Błąd przywracania (brak opisu).';
        if (xhr.status === 413) msg = 'Plik za duży (limit 100 MB) lub limit żądania na serwerze.';
        if (xhr.status === 403) msg = (data.error || 'Brak uprawnień (zaloguj się jako admin).') + (data.hint ? '\n\n' + data.hint : '');
        if (data.debug) msg += '\n\n[Debug serwera] ' + JSON.stringify(data.debug);
        setRestoreError(msg);
        setUploadProgress(0);
        alert('BŁĄD PRZYWRACANIA (status ' + xhr.status + '):\n\n' + msg);
        setRestoreLoading(false);
        return;
      }
      if (data.type !== 'moodboard' && data.type !== 'project' && data.type !== 'groups') {
        const msg = data.error || 'Nieprawidłowa odpowiedź serwera (brak type).';
        setRestoreError(msg);
        setUploadProgress(0);
        alert('BŁĄD:\n\n' + msg);
        setRestoreLoading(false);
        return;
      }
      setRestoreSuccess(data.message || (data.type === 'groups' ? 'Przywrócono dane grup.' : 'Przywrócono'));
      setRestoreFile(null);
      setRestoreNewName('');
      setUploadProgress(0);
      setRestoreLoading(false);
      fetchTree();
    });
    xhr.addEventListener('error', () => {
      clearTimeout(timeoutId);
      setUploadProgress(0);
      setRestoreError('Błąd połączenia (sieć lub serwer).');
      setRestoreLoading(false);
      alert('BŁĄD PRZYWRACANIA:\n\nBłąd połączenia (sieć lub serwer).');
    });
    xhr.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      setUploadProgress(0);
      setRestoreError('Przekroczono limit czasu (2 min) lub przerwano.');
      setRestoreLoading(false);
      alert('BŁĄD PRZYWRACANIA:\n\nPrzekroczono limit czasu (2 min) lub przerwano.');
    });
    xhr.open('POST', '/api/admin/data-storage/restore');
    xhr.withCredentials = true;
    xhr.send(form);
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
        <button
          type="button"
          className="admin-btn"
          disabled={!!backupLoading || !hasSelection}
          onClick={() => handleBackup('selected')}
          title={hasSelection ? `Zaznaczono: ${selectedBoardIds.size} moodboardów, ${selectedProjectIds.size} projektów` : 'Zaznacz elementy na liście'}
        >
          {backupLoading === 'selected' ? 'Pobieranie...' : `Zaznaczone (ZIP)${hasSelection ? ` (${selectedBoardIds.size + selectedProjectIds.size})` : ''}`}
        </button>
        <button type="button" onClick={fetchTree} className="admin-btn" style={{ marginLeft: 'auto' }}>
          <i className="las la-sync" style={{ marginRight: '6px' }} />
          Odśwież
        </button>
      </div>

      {/* Auto-backup section */}
      <div style={{ marginBottom: '20px', padding: '14px', border: '1px solid #d1d5db', borderRadius: '6px', backgroundColor: '#f9fafb' }}>
        <div style={{ fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="las la-clock" style={{ color: '#000000' }} />
          Automatyczny backup cykliczny
        </div>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#6b7280' }}>
          Backupy zapisywane na serwerze w <code>/data-storage/backups/</code>. Wymaga skonfigurowanego crona (Railway / zewnętrzny) na endpoint <code>POST /api/cron/backup</code> z nagłówkiem <code>x-cron-secret</code>.
        </p>

        {abLoading ? (
          <div style={{ color: '#9ca3af', fontSize: '13px' }}>Ładowanie ustawień...</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={abSettings.autoBackupEnabled}
                  onChange={(e) => handleAbSettingsUpdate({ autoBackupEnabled: e.target.checked })}
                  disabled={abSaving}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', fontWeight: 500 }}>
                  {abSettings.autoBackupEnabled ? 'Włączony' : 'Wyłączony'}
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                Interwał:
                <select
                  value={abSettings.autoBackupIntervalHours}
                  onChange={(e) => handleAbSettingsUpdate({ autoBackupIntervalHours: parseInt(e.target.value, 10) })}
                  disabled={abSaving}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '14px' }}
                >
                  <option value={6}>6h</option>
                  <option value={12}>12h</option>
                  <option value={24}>24h (codziennie)</option>
                  <option value={48}>48h (co 2 dni)</option>
                  <option value={168}>168h (tygodniowo)</option>
                </select>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
                Max plików:
                <select
                  value={abSettings.autoBackupMaxFiles}
                  onChange={(e) => handleAbSettingsUpdate({ autoBackupMaxFiles: parseInt(e.target.value, 10) })}
                  disabled={abSaving}
                  style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '14px' }}
                >
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={7}>7</option>
                  <option value={14}>14</option>
                  <option value={30}>30</option>
                </select>
              </label>

              <button
                type="button"
                className="admin-btn"
                disabled={abTriggering}
                onClick={handleAbTrigger}
                title="Utwórz backup teraz (zapisuje na serwerze)"
              >
                <i className="las la-play" style={{ marginRight: '4px' }} />
                {abTriggering ? 'Tworzenie...' : 'Utwórz backup teraz'}
              </button>
            </div>

            {abMessage && (
              <div style={{
                marginBottom: '12px',
                padding: '8px 12px',
                borderRadius: '4px',
                fontSize: '13px',
                backgroundColor: abMessage.startsWith('Błąd') ? '#fef2f2' : '#ecfdf5',
                border: `1px solid ${abMessage.startsWith('Błąd') ? '#fecaca' : '#a7f3d0'}`,
                color: abMessage.startsWith('Błąd') ? '#b91c1c' : '#059669',
              }}>
                {abMessage}
              </div>
            )}

            {abBackups.length > 0 ? (
              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: '4px',
                overflow: 'hidden',
                fontSize: '13px',
              }}>
                <div style={{
                  padding: '6px 12px',
                  backgroundColor: '#f3f4f6',
                  fontWeight: 600,
                  display: 'flex',
                  gap: '12px',
                  borderBottom: '1px solid #e5e7eb',
                }}>
                  <span style={{ flex: 1 }}>Plik</span>
                  <span style={{ width: '80px', textAlign: 'right' }}>Rozmiar</span>
                  <span style={{ width: '140px', textAlign: 'right' }}>Data</span>
                  <span style={{ width: '100px', textAlign: 'right' }}>Akcje</span>
                </div>
                {abBackups.map((b) => (
                  <div
                    key={b.name}
                    style={{
                      padding: '6px 12px',
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'center',
                      borderBottom: '1px solid #f3f4f6',
                    }}
                  >
                    <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px' }}>{b.name}</span>
                    <span style={{ width: '80px', textAlign: 'right', color: '#6b7280' }}>{formatBytes(b.sizeBytes)}</span>
                    <span style={{ width: '140px', textAlign: 'right', color: '#6b7280' }}>{formatDate(b.createdAt)}</span>
                    <span style={{ width: '100px', textAlign: 'right', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => handleAbDownload(b.name)}
                        className="admin-btn"
                        style={{ padding: '2px 8px', fontSize: '12px' }}
                        title="Pobierz"
                      >
                        <i className="las la-download" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAbDelete(b.name)}
                        className="admin-btn admin-btn--danger"
                        style={{ padding: '2px 8px', fontSize: '12px' }}
                        title="Usuń"
                      >
                        <i className="las la-trash" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#9ca3af', fontSize: '13px' }}>
                Brak zapisanych backupów na serwerze.
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ marginBottom: '20px', padding: '14px', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: '#f9fafb' }}>
        <div style={{ fontWeight: 600, marginBottom: '10px' }}>Przywróć z ZIP (moodboard lub projekt)</div>
        <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#6b7280' }}>
          Wgraj plik ZIP z backupu. Wybierz grupę, do której przywrócić (lub „Grupa globalna”). Jeśli moodboard lub projekt o tym samym ID już istnieje, podaj nową nazwę – zostanie utworzony z nowym ID. Komunikat błędu lub sukcesu pojawi się pod przyciskiem.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input
              type="file"
              name="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setRestoreFile(f);
                setRestoreConflict(null);
                setRestoreSuccess(null);
                setRestoreError(null);
                if (f) logger.debug('[Restore] Wybrano plik:', f.name, 'rozmiar:', (f.size / 1024 / 1024).toFixed(2), 'MB');
              }}
              style={{ fontSize: '13px' }}
            />
            <span style={{ fontSize: '14px' }}>Plik ZIP</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
            <span style={{ whiteSpace: 'nowrap' }}>Przywróć do grupy:</span>
            <select
              value={restoreToGroupId}
              onChange={(e) => setRestoreToGroupId(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '14px', minWidth: '180px', border: '1px solid #d1d5db', borderRadius: '4px' }}
            >
              <option value="">Grupa globalna (bez przypisania)</option>
              {tree?.groups?.map((g) => (
                <option key={g.groupId} value={g.groupId}>{g.groupName}</option>
              ))}
            </select>
          </label>
          {restoreFile ? (
            <span style={{ fontSize: '13px', color: '#059669', fontWeight: 500 }}>
              Wybrano: {restoreFile.name} ({restoreFile.size >= 1024 * 1024
                ? (restoreFile.size / 1024 / 1024).toFixed(2) + ' MB'
                : (restoreFile.size / 1024).toFixed(1) + ' KB'})
            </span>
          ) : (
            <span style={{ fontSize: '13px', color: '#9ca3af' }}>Nie wybrano pliku</span>
          )}
          <input
            type="text"
            placeholder="Nazwa projektu (opcjonalnie, nadpisuje z ZIP)"
            value={restoreNewName}
            onChange={(e) => setRestoreNewName(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '14px', minWidth: '220px', border: '1px solid #d1d5db', borderRadius: '4px' }}
          />
          <button
            type="button"
            className="admin-btn"
            disabled={restoreLoading || !restoreFile}
            onClick={handleRestore}
          >
            {restoreLoading ? `Wysyłanie ${restoreFile?.name ?? '...'}...` : 'Przywróć'}
          </button>
        </div>
        {(restoreFile || restoreLoading) && (
          <div style={{ marginTop: '14px', padding: '14px', backgroundColor: '#eff6ff', border: '2px solid #2563eb', borderRadius: '8px' }}>
            <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px', color: '#1e40af' }}>
              {restoreLoading ? 'Pasek uploadu — wgrywanie pliku…' : 'Pasek uploadu — kliknij Przywróć, aby wgrać'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '14px', color: '#1e3a8a' }}>
              <span>{restoreFile?.name ?? 'plik'}</span>
              <span><strong>{uploadProgress}%</strong></span>
            </div>
            <div style={{ height: '24px', backgroundColor: '#bfdbfe', borderRadius: '6px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.max(2, uploadProgress)}%`,
                  backgroundColor: '#2563eb',
                  borderRadius: '6px',
                  transition: 'width 0.25s ease-out',
                }}
              />
            </div>
          </div>
        )}
        {restoreError && (
          <div style={{ marginTop: '10px', padding: '12px', backgroundColor: '#fef2f2', border: '2px solid #dc2626', borderRadius: '6px', fontSize: '14px', color: '#b91c1c', fontWeight: 500, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} role="alert">
            <strong>Błąd:</strong>
            <br />
            {restoreError}
          </div>
        )}
        {restoreConflict && (
          <div style={{ marginTop: '10px', padding: '8px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '13px', color: '#b91c1c' }}>
            Element o tym ID już istnieje. Wpisz nową nazwę powyżej i kliknij „Przywróć" – zostanie utworzony z nowym ID.
          </div>
        )}
        {restoreSuccess && (
          <div style={{ marginTop: '10px', padding: '8px 12px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '4px', fontSize: '13px', color: '#059669' }}>
            {restoreSuccess}
          </div>
        )}
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#fafafa' }}>
        <div style={{ padding: '12px 16px', backgroundColor: '#f3f4f6', fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>
          /data-storage
        </div>

        {/* Global (bez grupy) */}
        {(tree?.moodboard?.boards?.length || tree?.projects?.length) ? (
          <div style={{ borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ padding: '10px 16px', backgroundColor: '#e0e7ff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="las la-globe" style={{ color: '#3730a3' }} />
              Grupa globalna (bez przypisania)
            </div>
            {tree?.moodboard?.boards?.length ? (
              <div style={{ borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ padding: '8px 16px 8px 24px', backgroundColor: '#eff6ff', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="las la-th-large" style={{ color: '#2563eb' }} />
                  moodboard/
                </div>
                <ul style={{ margin: 0, paddingLeft: '40px', paddingBottom: '8px', listStyle: 'none' }}>
                  {tree.moodboard.boards.map((board) => (
                    <li key={`global:${board.id}`} style={{ padding: '8px 0', fontSize: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                          <input
                            type="checkbox"
                            checked={selectedBoardIds.has(board.id)}
                            onChange={() => toggleBoard(board.id)}
                            style={{ margin: 0, cursor: 'pointer' }}
                          />
                        </label>
                        <span style={{ color: '#6b7280' }}>—</span>
                        <span>{board.name || 'Moodboard'}</span>
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>({board.id})</span>
                        <span style={{ color: '#6b7280', fontSize: '12px' }}>
                          ({board.imagesCount} {board.imagesCount === 1 ? 'obraz' : 'obrazów'}, {(board.sketchesCount ?? 0)} {(board.sketchesCount ?? 0) === 1 ? 'szkic' : (board.sketchesCount ?? 0) >= 2 && (board.sketchesCount ?? 0) <= 4 ? 'szkice' : 'szkiców'})
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {tree?.projects?.length ? (
              <div>
                <div style={{ padding: '8px 16px 8px 24px', backgroundColor: '#f0fdf4', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="las la-folder" style={{ color: '#16a34a' }} />
                  projects/
                </div>
                <ul style={{ margin: 0, paddingLeft: '40px', paddingBottom: '12px', listStyle: 'none' }}>
                  {tree.projects.map((project) => (
                    <li key={`global:${project.id}`} style={{ padding: '8px 0', fontSize: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                          <input
                            type="checkbox"
                            checked={selectedProjectIds.has(project.id)}
                            onChange={() => toggleProject(project.id)}
                            style={{ margin: 0, cursor: 'pointer' }}
                          />
                        </label>
                        <span style={{ color: '#6b7280' }}>—</span>
                        {project.name}
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>({project.id})</span>
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
          </div>
        ) : null}

        {/* Grupy */}
        {tree?.groups?.map((group) => (
          <div key={group.groupId} style={{ borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ padding: '10px 16px', backgroundColor: '#fef3c7', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="las la-users" style={{ color: '#b45309' }} />
              {group.groupName}
              <span style={{ fontWeight: 400, color: '#92400e', fontSize: '13px' }}>({group.groupId})</span>
            </div>
            {group.moodboard?.boards?.length ? (
              <div style={{ borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ padding: '8px 16px 8px 24px', backgroundColor: '#eff6ff', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="las la-th-large" style={{ color: '#2563eb' }} />
                  moodboard/
                </div>
                <ul style={{ margin: 0, paddingLeft: '40px', paddingBottom: '8px', listStyle: 'none' }}>
                  {group.moodboard.boards.map((board) => (
                    <li key={`${group.groupId}:${board.id}`} style={{ padding: '8px 0', fontSize: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                          <input
                            type="checkbox"
                            checked={selectedBoardIds.has(board.id)}
                            onChange={() => toggleBoard(board.id)}
                            style={{ margin: 0, cursor: 'pointer' }}
                          />
                        </label>
                        <span style={{ color: '#6b7280' }}>—</span>
                        <span>{board.name || 'Moodboard'}</span>
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>({board.id})</span>
                        <span style={{ color: '#6b7280', fontSize: '12px' }}>
                          ({board.imagesCount} {board.imagesCount === 1 ? 'obraz' : 'obrazów'}, {(board.sketchesCount ?? 0)} {(board.sketchesCount ?? 0) === 1 ? 'szkic' : (board.sketchesCount ?? 0) >= 2 && (board.sketchesCount ?? 0) <= 4 ? 'szkice' : 'szkiców'})
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {group.projects?.length ? (
              <div>
                <div style={{ padding: '8px 16px 8px 24px', backgroundColor: '#f0fdf4', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="las la-folder" style={{ color: '#16a34a' }} />
                  projects/
                </div>
                <ul style={{ margin: 0, paddingLeft: '40px', paddingBottom: '12px', listStyle: 'none' }}>
                  {group.projects.map((project) => (
                    <li key={`${group.groupId}:${project.id}`} style={{ padding: '8px 0', fontSize: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                          <input
                            type="checkbox"
                            checked={selectedProjectIds.has(project.id)}
                            onChange={() => toggleProject(project.id)}
                            style={{ margin: 0, cursor: 'pointer' }}
                          />
                        </label>
                        <span style={{ color: '#6b7280' }}>—</span>
                        {project.name}
                        <span style={{ color: '#9ca3af', fontSize: '12px' }}>({project.id})</span>
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
          </div>
        ))}

        {tree && !tree.moodboard?.boards?.length && !tree.projects?.length && (!tree.groups?.length || tree.groups?.every((g) => !g.moodboard?.boards?.length && !g.projects?.length)) ? (
          <div style={{ padding: '16px', color: '#6b7280', fontSize: '14px' }}>
            Brak danych moodboard ani projektów w nowej strukturze. Uruchom skrypt migracji jeśli masz stare dane.
          </div>
        ) : null}
      </div>
    </div>
  );
};

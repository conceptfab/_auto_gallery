// src/components/admin/CacheMonitorSection.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@/src/utils/logger';

interface CacheStatus {
  scheduler: {
    enabled: boolean;
    nextRun: string | null;
    lastRun: string | null;
    lastRunDuration: number | null;
  };
  hashChecker: {
    totalFolders: number;
    totalFiles: number;
    lastScanTime: string | null;
    changesDetected: number;
  };
  thumbnails: {
    totalGenerated: number;
    storageUsed: number;
    storageLocation: 'local' | 'remote';
  };
  scanInProgress: boolean;
  schedulerActive: boolean;
}

interface SchedulerConfig {
  enabled: boolean;
  workHours: {
    start: number;
    end: number;
    intervalMinutes: number;
  };
  offHours: {
    enabled: boolean;
    intervalMinutes: number | null;
  };
  timezone: string;
}

interface ThumbnailConfig {
  format: 'webp' | 'avif' | 'jpeg';
  storage: 'local' | 'remote';
}

interface EmailNotificationConfig {
  enabled: boolean;
  email: string;
  notifyOnRebuild: boolean;
  notifyOnError: boolean;
}

interface HistoryEntry {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  duration?: number;
}

interface ChangeEntry {
  id: string;
  timestamp: string;
  type: string;
  path: string;
}

interface FolderInfo {
  path: string;
  name: string;
  fileCount: number;
  imageCount: number;
  subfolders: string[];
  error?: string;
}

interface DiagnosticsData {
  envCheck: {
    FILE_LIST_URL: string;
    FILE_PROXY_SECRET: string;
  };
  folders: FolderInfo[];
  summary: {
    totalFolders: number;
    totalImages: number;
    foldersWithImages: number;
  };
  errors: string[];
}

interface FolderHashRecord {
  path: string;
  currentHash: string;
  previousHash: string | null;
  timestamp: string;
  fileCount: number;
}

interface HashStats {
  total: number;
  matching: number;
  changed: number;
  newFolders: number;
}

interface ImageCacheStatus {
  path: string;
  name: string;
  cached: boolean;
  thumbnailPath?: string;
}

interface FolderCacheStatus {
  images: ImageCacheStatus[];
  summary: {
    total: number;
    cached: number;
    uncached: number;
    percentage: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function formatDate(isoString: string | null): string {
  if (!isoString) return '-';
  return new Date(isoString).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const CacheMonitorSection: React.FC = () => {
  const [status, setStatus] = useState<CacheStatus | null>(null);
  const [schedulerConfig, setSchedulerConfig] = useState<SchedulerConfig | null>(null);
  const [thumbnailConfig, setThumbnailConfig] = useState<ThumbnailConfig | null>(null);
  const [emailConfig, setEmailConfig] = useState<EmailNotificationConfig | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'folders' | 'hashes' | 'config' | 'history' | 'changes'>('status');
  const [cleaningHistory, setCleaningHistory] = useState(false);
  const [rebuildingFolder, setRebuildingFolder] = useState<string | null>(null);
  const [lastRebuiltFolder, setLastRebuiltFolder] = useState<{ path: string; timestamp: string } | null>(null);
  const [folderHashes, setFolderHashes] = useState<FolderHashRecord[]>([]);
  const [hashStats, setHashStats] = useState<HashStats | null>(null);
  const [hashesLoading, setHashesLoading] = useState(false);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [folderCacheStatus, setFolderCacheStatus] = useState<Record<string, FolderCacheStatus>>({});
  const [loadingCacheStatus, setLoadingCacheStatus] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/cache/status');
      const data = await response.json();
      if (data.success) {
        setStatus(data.status);
        setSchedulerConfig(data.config.scheduler);
        setThumbnailConfig(data.config.thumbnails);
        if (data.config.email) {
          setEmailConfig(data.config.email);
        }
      }
    } catch (error) {
      logger.error('Error fetching cache status', error);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/cache/history?limit=30');
      const data = await response.json();
      if (data.success) {
        setHistory(data.history || []);
        setChanges(data.recentChanges || []);
      }
    } catch (error) {
      logger.error('Error fetching history', error);
    }
  }, []);

  const fetchDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    try {
      const response = await fetch('/api/admin/cache/diagnostics');
      const data = await response.json();
      if (data.success) {
        setDiagnostics(data);
      }
    } catch (error) {
      logger.error('Error fetching diagnostics', error);
    } finally {
      setDiagLoading(false);
    }
  }, []);

  const fetchFolderCacheStatus = useCallback(async (folderPath: string) => {
    setLoadingCacheStatus(folderPath);
    try {
      const response = await fetch(`/api/admin/cache/folder-status?folder=${encodeURIComponent(folderPath)}`);
      const data = await response.json();
      if (data.success) {
        setFolderCacheStatus(prev => ({
          ...prev,
          [folderPath]: {
            images: data.images,
            summary: data.summary,
          },
        }));
      }
    } catch (error) {
      logger.error('Error fetching folder cache status', error);
    } finally {
      setLoadingCacheStatus(null);
    }
  }, []);

  const toggleFolderExpand = useCallback((folderPath: string) => {
    if (expandedFolder === folderPath) {
      setExpandedFolder(null);
    } else {
      setExpandedFolder(folderPath);
      if (!folderCacheStatus[folderPath]) {
        fetchFolderCacheStatus(folderPath);
      }
    }
  }, [expandedFolder, folderCacheStatus, fetchFolderCacheStatus]);

  useEffect(() => {
    Promise.all([fetchStatus(), fetchHistory()]).finally(() =>
      setLoading(false),
    );

    // Auto-refresh co 30 sekund
    const interval = setInterval(() => {
      fetchStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchStatus, fetchHistory]);

  const handleTrigger = async (action: 'scan' | 'regenerate' | 'clear' | 'build') => {
    setTriggering(action);
    try {
      const response = await fetch('/api/admin/cache/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (data.success) {
        // Odśwież po chwili
        setTimeout(() => {
          fetchStatus();
          fetchHistory();
        }, 2000);
      } else {
        alert(data.error || 'Błąd');
      }
    } catch (error) {
      logger.error('Error triggering action', error);
      alert('Błąd');
    } finally {
      setTriggering(null);
    }
  };

  const handleConfigUpdate = async (
    type: 'scheduler' | 'thumbnails',
    updates: Partial<SchedulerConfig> | Partial<ThumbnailConfig>,
  ) => {
    try {
      const body: Record<string, unknown> = {};
      if (type === 'scheduler') {
        body.schedulerConfig = updates;
      } else {
        body.thumbnailConfig = updates;
      }

      const response = await fetch('/api/admin/cache/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.success) {
        setSchedulerConfig(data.schedulerConfig);
        setThumbnailConfig(data.thumbnailConfig);
        fetchStatus();
      }
    } catch (error) {
      logger.error('Error updating config', error);
    }
  };

  const handleCleanupHistory = async (retentionHours?: number) => {
    setCleaningHistory(true);
    try {
      const response = await fetch('/api/admin/cache/cleanup-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleanup', retentionHours: retentionHours ?? 24 }),
      });
      const data = await response.json();
      if (data.success) {
        alert(data.message);
        fetchHistory();
      }
    } catch (error) {
      logger.error('Error cleaning up history', error);
      alert('Błąd podczas czyszczenia historii');
    } finally {
      setCleaningHistory(false);
    }
  };

  const handleClearAllHistory = async () => {
    setCleaningHistory(true);
    try {
      const response = await fetch('/api/admin/cache/cleanup-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      const data = await response.json();
      if (data.success) {
        alert(data.message);
        fetchHistory();
      }
    } catch (error) {
      logger.error('Error clearing history', error);
      alert('Błąd podczas czyszczenia historii');
    } finally {
      setCleaningHistory(false);
    }
  };

  const handleEmailConfigUpdate = async (updates: Partial<EmailNotificationConfig>) => {
    try {
      const response = await fetch('/api/admin/cache/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailNotificationConfig: updates }),
      });
      const data = await response.json();
      if (data.success) {
        setEmailConfig(data.emailNotificationConfig);
      }
    } catch (error) {
      logger.error('Error updating email config', error);
    }
  };

  const handleRebuildFolder = async (folderPath: string) => {
    setRebuildingFolder(folderPath);
    try {
      const response = await fetch('/api/admin/cache/rebuild-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath }),
      });
      const data = await response.json();
      if (data.success) {
        setLastRebuiltFolder({ path: folderPath, timestamp: new Date().toISOString() });
        alert(data.message);
        fetchStatus();
        fetchHistory();
      }
    } catch (error) {
      logger.error('Error rebuilding folder', error);
      alert('Błąd podczas przebudowy folderu');
    } finally {
      setRebuildingFolder(null);
    }
  };

  const fetchFolderHashes = async () => {
    setHashesLoading(true);
    try {
      const response = await fetch('/api/admin/cache/folder-hashes');
      const data = await response.json();
      if (data.success) {
        setFolderHashes(data.records || []);
        setHashStats(data.stats);
      }
    } catch (error) {
      logger.error('Error fetching folder hashes', error);
    } finally {
      setHashesLoading(false);
    }
  };

  if (loading) {
    return <div className="admin-card">Ładowanie...</div>;
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '5px', borderBottom: '1px solid #e5e7eb', paddingBottom: '10px' }}>
        {(['status', 'folders', 'hashes', 'config', 'history', 'changes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              if (tab === 'folders' && !diagnostics) {
                fetchDiagnostics();
              }
              if (tab === 'hashes' && folderHashes.length === 0) {
                fetchFolderHashes();
              }
            }}
            className="admin-btn"
            style={{
              backgroundColor: activeTab === tab ? '#7c3aed' : '#f3f4f6',
              color: activeTab === tab ? 'white' : '#374151',
              border: 'none',
              padding: '8px 16px',
              fontSize: '13px',
            }}
          >
            {tab === 'status' && 'Status'}
            {tab === 'folders' && 'Foldery'}
            {tab === 'hashes' && 'Hasze'}
            {tab === 'config' && 'Konfiguracja'}
            {tab === 'history' && 'Historia'}
            {tab === 'changes' && 'Zmiany plików'}
          </button>
        ))}
      </div>

      {/* Status Tab */}
      {activeTab === 'status' && (
        <>
          {/* Alert - brak cache */}
          {status && status.thumbnails.totalGenerated === 0 && (
            <div
              style={{
                padding: '16px 20px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                marginBottom: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '15px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <i className="las la-exclamation-triangle" style={{ fontSize: '24px', color: '#dc2626' }}></i>
                <div>
                  <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: '2px' }}>
                    Cache miniaturek jest pusty!
                  </div>
                  <div style={{ fontSize: '13px', color: '#b91c1c' }}>
                    Aplikacja ładuje oryginalne pliki. Zbuduj cache żeby przyspieszyć ładowanie.
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleTrigger('build')}
                disabled={triggering !== null || status?.scanInProgress}
                style={{
                  padding: '10px 20px',
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: triggering ? 'not-allowed' : 'pointer',
                  opacity: triggering ? 0.7 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {triggering === 'build' ? 'Budowanie...' : 'Zbuduj cache teraz'}
              </button>
            </div>
          )}

          {/* Status cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
            {/* Scheduler */}
            <div style={{ padding: '20px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Scheduler
              </div>
              <div style={{
                fontSize: '24px',
                fontWeight: 700,
                color: status?.scheduler.enabled ? '#059669' : '#dc2626',
                marginBottom: '8px',
              }}>
                {status?.scheduler.enabled ? 'Aktywny' : 'Wyłączony'}
              </div>
              {status?.scheduler.enabled && (
                <>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    Ostatni skan: {formatDate(status.scheduler.lastRun)}
                  </div>
                  {status.scheduler.lastRunDuration && (
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      Czas: {formatDuration(status.scheduler.lastRunDuration)}
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: '#059669', marginTop: '5px' }}>
                    Następny: {formatDate(status.scheduler.nextRun)}
                  </div>
                </>
              )}
            </div>

            {/* Files */}
            <div style={{ padding: '20px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Monitorowane pliki
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
                {status?.hashChecker.totalFiles || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Foldery: {status?.hashChecker.totalFolders || 0}
              </div>
              <div style={{ fontSize: '12px', color: status?.hashChecker.changesDetected ? '#f59e0b' : '#6b7280' }}>
                Ostatnie zmiany: {status?.hashChecker.changesDetected || 0}
              </div>
            </div>

            {/* Thumbnails */}
            <div style={{ padding: '20px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Miniaturki
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
                {status?.thumbnails.totalGenerated || 0}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Rozmiar: {formatBytes(status?.thumbnails.storageUsed || 0)}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Storage: {status?.thumbnails.storageLocation === 'local' ? 'Railway' : 'Remote'}
              </div>
              <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '10px', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
                <div style={{ fontWeight: 500, marginBottom: '4px' }}>Rozmiary na plik:</div>
                <div>thumb: 300x300, q80</div>
                <div>medium: 800x800, q85</div>
                <div>large: 1920x1920, q90</div>
                <div style={{ marginTop: '4px', color: '#059669', fontWeight: 500 }}>
                  3 miniaturki / plik obrazu
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="admin-card">
            <h3 style={{ margin: '0 0 15px 0', fontSize: '14px' }}>Akcje</h3>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleTrigger('build')}
                disabled={triggering !== null || status?.scanInProgress}
                style={{
                  padding: '8px 16px',
                  background: status?.thumbnails.totalGenerated === 0 ? '#dc2626' : '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: triggering ? 'not-allowed' : 'pointer',
                  opacity: triggering ? 0.7 : 1,
                }}
              >
                {triggering === 'build'
                  ? 'Budowanie...'
                  : status?.scanInProgress
                    ? 'W toku...'
                    : 'Zbuduj cache'}
              </button>
              <button
                onClick={() => handleTrigger('scan')}
                disabled={triggering !== null || status?.scanInProgress}
                className="admin-btn admin-btn--purple"
              >
                {status?.scanInProgress
                  ? 'Skanowanie...'
                  : triggering === 'scan'
                    ? 'Uruchamianie...'
                    : 'Skanuj zmiany'}
              </button>
              <button
                onClick={() => handleTrigger('regenerate')}
                disabled={triggering !== null || status?.scanInProgress}
                className="admin-btn admin-btn--success"
              >
                {triggering === 'regenerate' ? 'Uruchamianie...' : 'Regeneruj miniaturki'}
              </button>
              <button
                onClick={() => {
                  if (confirm('Czy na pewno usunąć wszystkie miniaturki?')) {
                    handleTrigger('clear');
                  }
                }}
                disabled={triggering !== null}
                className="admin-btn admin-btn--danger"
              >
                {triggering === 'clear' ? 'Usuwanie...' : 'Wyczyść cache'}
              </button>
              <button
                onClick={() => {
                  fetchStatus();
                  fetchHistory();
                }}
                className="admin-btn"
                style={{ marginLeft: 'auto' }}
              >
                Odśwież
              </button>
            </div>
          </div>
        </>
      )}

      {/* Folders Tab */}
      {activeTab === 'folders' && (
        <div className="admin-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Struktura folderów do cache&apos;owania</h3>
            <button
              onClick={fetchDiagnostics}
              disabled={diagLoading}
              className="admin-btn"
            >
              {diagLoading ? 'Skanowanie...' : 'Skanuj foldery'}
            </button>
          </div>

          {diagLoading && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <i className="las la-spinner la-spin" style={{ fontSize: '32px' }}></i>
              <div style={{ marginTop: '10px' }}>Skanowanie struktury folderów...</div>
            </div>
          )}

          {!diagLoading && diagnostics && (
            <>
              {/* Env check */}
              <div style={{
                padding: '12px',
                background: '#f9fafb',
                borderRadius: '6px',
                marginBottom: '15px',
                fontSize: '12px',
                fontFamily: 'monospace'
              }}>
                <div style={{ fontWeight: 600, marginBottom: '8px' }}>Konfiguracja:</div>
                <div style={{ color: diagnostics.envCheck.FILE_LIST_URL === 'SET' ? '#059669' : '#dc2626' }}>
                  FILE_LIST_URL: {diagnostics.envCheck.FILE_LIST_URL}
                </div>
                <div style={{ color: diagnostics.envCheck.FILE_PROXY_SECRET === 'SET' ? '#059669' : '#dc2626' }}>
                  FILE_PROXY_SECRET: {diagnostics.envCheck.FILE_PROXY_SECRET}
                </div>
              </div>

              {/* Summary */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                marginBottom: '15px'
              }}>
                <div style={{ padding: '15px', background: '#dbeafe', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#1e40af' }}>
                    {diagnostics.summary.totalFolders}
                  </div>
                  <div style={{ fontSize: '12px', color: '#1e40af' }}>Folderów</div>
                </div>
                <div style={{ padding: '15px', background: '#d1fae5', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#065f46' }}>
                    {diagnostics.summary.totalImages}
                  </div>
                  <div style={{ fontSize: '12px', color: '#065f46' }}>Obrazów do cache</div>
                </div>
                <div style={{ padding: '15px', background: '#fef3c7', borderRadius: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#92400e' }}>
                    {diagnostics.summary.foldersWithImages}
                  </div>
                  <div style={{ fontSize: '12px', color: '#92400e' }}>Folderów z obrazami</div>
                </div>
              </div>

              {/* Errors */}
              {diagnostics.errors.length > 0 && (
                <div style={{
                  padding: '12px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  marginBottom: '15px'
                }}>
                  <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: '8px' }}>
                    Błędy ({diagnostics.errors.length}):
                  </div>
                  {diagnostics.errors.slice(0, 5).map((err, i) => (
                    <div key={i} style={{ fontSize: '12px', color: '#b91c1c', marginBottom: '4px' }}>
                      {err}
                    </div>
                  ))}
                  {diagnostics.errors.length > 5 && (
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                      ...i {diagnostics.errors.length - 5} więcej
                    </div>
                  )}
                </div>
              )}

              {/* Folder list */}
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Folder</th>
                      <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '80px' }}>Obrazy</th>
                      <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '100px' }}>Cache</th>
                      <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '80px' }}>Podfoldery</th>
                      <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '100px' }}>Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostics.folders
                      .filter(f => f.imageCount > 0 || f.error)
                      .map((folder, i) => (
                      <React.Fragment key={i}>
                        <tr
                          style={{
                            borderBottom: expandedFolder === folder.path ? 'none' : '1px solid #f3f4f6',
                            cursor: folder.imageCount > 0 ? 'pointer' : 'default',
                            background: expandedFolder === folder.path ? '#f0f9ff' : 'transparent',
                          }}
                          onClick={() => folder.imageCount > 0 && toggleFolderExpand(folder.path)}
                        >
                          <td style={{ padding: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {folder.imageCount > 0 && (
                                <i
                                  className={`las ${expandedFolder === folder.path ? 'la-chevron-down' : 'la-chevron-right'}`}
                                  style={{ fontSize: '12px', color: '#6b7280' }}
                                ></i>
                              )}
                              <div style={{
                                fontFamily: 'monospace',
                                fontSize: '12px',
                                color: folder.error ? '#dc2626' : '#374151'
                              }}>
                                {folder.path}
                              </div>
                            </div>
                            {folder.error && (
                              <div style={{ fontSize: '11px', color: '#dc2626', marginLeft: '20px' }}>{folder.error}</div>
                            )}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <span style={{
                              fontWeight: folder.imageCount > 0 ? 600 : 400,
                              color: folder.imageCount > 0 ? '#059669' : '#9ca3af'
                            }}>
                              {folder.imageCount}
                            </span>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            {loadingCacheStatus === folder.path ? (
                              <i className="las la-spinner la-spin" style={{ color: '#6b7280' }}></i>
                            ) : folderCacheStatus[folder.path] ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                <span style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: folderCacheStatus[folder.path].summary.percentage === 100 ? '#059669'
                                    : folderCacheStatus[folder.path].summary.percentage > 0 ? '#f59e0b'
                                    : '#dc2626'
                                }}>
                                  {folderCacheStatus[folder.path].summary.cached}/{folderCacheStatus[folder.path].summary.total}
                                </span>
                                <i
                                  className={`las ${
                                    folderCacheStatus[folder.path].summary.percentage === 100 ? 'la-check-circle'
                                    : folderCacheStatus[folder.path].summary.percentage > 0 ? 'la-exclamation-circle'
                                    : 'la-times-circle'
                                  }`}
                                  style={{
                                    color: folderCacheStatus[folder.path].summary.percentage === 100 ? '#059669'
                                      : folderCacheStatus[folder.path].summary.percentage > 0 ? '#f59e0b'
                                      : '#dc2626',
                                    fontSize: '14px'
                                  }}
                                ></i>
                              </div>
                            ) : (
                              <button
                                onClick={() => fetchFolderCacheStatus(folder.path)}
                                disabled={folder.imageCount === 0}
                                style={{
                                  padding: '2px 6px',
                                  fontSize: '10px',
                                  background: '#f3f4f6',
                                  color: '#6b7280',
                                  border: 'none',
                                  borderRadius: '3px',
                                  cursor: folder.imageCount === 0 ? 'not-allowed' : 'pointer',
                                }}
                              >
                                Sprawdź
                              </button>
                            )}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center', color: '#6b7280' }}>
                            {folder.subfolders.length}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                              <button
                                onClick={() => handleRebuildFolder(folder.path)}
                                disabled={rebuildingFolder !== null || folder.imageCount === 0}
                                title={folder.imageCount === 0 ? 'Brak obrazów' : 'Przebuduj miniaturki'}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  background: folder.imageCount === 0 ? '#f3f4f6' : '#e0e7ff',
                                  color: folder.imageCount === 0 ? '#9ca3af' : '#4338ca',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: folder.imageCount === 0 ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                {rebuildingFolder === folder.path ? (
                                  <i className="las la-spinner la-spin"></i>
                                ) : (
                                  <i className="las la-sync-alt"></i>
                                )}
                              </button>
                              {lastRebuiltFolder?.path === folder.path && (
                                <span
                                  title={`Ostatnio przebudowany: ${formatDate(lastRebuiltFolder.timestamp)}`}
                                  style={{ color: '#059669', fontSize: '14px' }}
                                >
                                  <i className="las la-check-circle"></i>
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Rozwinięty widok obrazów */}
                        {expandedFolder === folder.path && (
                          <tr>
                            <td colSpan={5} style={{ padding: 0, background: '#f8fafc' }}>
                              <div style={{
                                padding: '12px 20px',
                                borderBottom: '1px solid #e5e7eb',
                                maxHeight: '300px',
                                overflowY: 'auto'
                              }}>
                                {loadingCacheStatus === folder.path ? (
                                  <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                                    <i className="las la-spinner la-spin" style={{ fontSize: '24px' }}></i>
                                    <div style={{ marginTop: '8px', fontSize: '12px' }}>Sprawdzanie cache...</div>
                                  </div>
                                ) : folderCacheStatus[folder.path] ? (
                                  <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                    gap: '8px'
                                  }}>
                                    {folderCacheStatus[folder.path].images.map((img, idx) => (
                                      <div
                                        key={idx}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '8px',
                                          padding: '6px 10px',
                                          background: img.cached ? '#ecfdf5' : '#fef2f2',
                                          borderRadius: '4px',
                                          fontSize: '11px',
                                        }}
                                      >
                                        <i
                                          className={`las ${img.cached ? 'la-check-circle' : 'la-times-circle'}`}
                                          style={{
                                            color: img.cached ? '#059669' : '#dc2626',
                                            fontSize: '16px',
                                            flexShrink: 0,
                                          }}
                                        ></i>
                                        <span
                                          style={{
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            color: img.cached ? '#065f46' : '#991b1b',
                                          }}
                                          title={img.name}
                                        >
                                          {img.name}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280', fontSize: '12px' }}>
                                    Kliknij &quot;Sprawdź&quot; aby zobaczyć status cache
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!diagLoading && !diagnostics && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <i className="las la-folder-open" style={{ fontSize: '48px', marginBottom: '10px' }}></i>
              <div>Kliknij &quot;Skanuj foldery&quot; aby zobaczyć strukturę</div>
            </div>
          )}
        </div>
      )}

      {/* Hashes Tab */}
      {activeTab === 'hashes' && (
        <div className="admin-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Weryfikacja hashy folderów</h3>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
              {hashStats && (
                <>
                  <span style={{ fontSize: '12px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="las la-check-circle"></i> Zgodne: {hashStats.matching}
                  </span>
                  <span style={{ fontSize: '12px', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="las la-exclamation-circle"></i> Zmienione: {hashStats.changed}
                  </span>
                  <span style={{ fontSize: '12px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <i className="las la-plus-circle"></i> Nowe: {hashStats.newFolders}
                  </span>
                </>
              )}
              <button
                onClick={fetchFolderHashes}
                disabled={hashesLoading}
                className="admin-btn"
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                {hashesLoading ? 'Ładowanie...' : 'Odśwież'}
              </button>
            </div>
          </div>

          {hashesLoading && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <i className="las la-spinner la-spin" style={{ fontSize: '32px' }}></i>
              <div style={{ marginTop: '10px' }}>Ładowanie hashy folderów...</div>
            </div>
          )}

          {!hashesLoading && folderHashes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <i className="las la-fingerprint" style={{ fontSize: '48px', marginBottom: '10px' }}></i>
              <div>Brak danych o hashach. Uruchom skanowanie.</div>
            </div>
          )}

          {!hashesLoading && folderHashes.length > 0 && (
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Folder</th>
                    <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '80px' }}>Plików</th>
                    <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: '100px' }}>Status</th>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', width: '150px' }}>Aktualny hash</th>
                  </tr>
                </thead>
                <tbody>
                  {folderHashes.map((record, i) => {
                    const isMatch = record.previousHash && record.currentHash === record.previousHash;
                    const isChanged = record.previousHash && record.currentHash !== record.previousHash;
                    const isNew = !record.previousHash;

                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '11px' }}>
                          {record.path || '/'}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {record.fileCount}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {isMatch && (
                            <span style={{ color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              <i className="las la-check-circle"></i> Zgodny
                            </span>
                          )}
                          {isChanged && (
                            <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              <i className="las la-exclamation-circle"></i> Zmieniony
                            </span>
                          )}
                          {isNew && (
                            <span style={{ color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              <i className="las la-plus-circle"></i> Nowy
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '10px', color: '#6b7280' }}>
                          {record.currentHash.substring(0, 12)}...
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Config Tab */}
      {activeTab === 'config' && schedulerConfig && (
        <div style={{ display: 'grid', gap: '20px' }}>
          {/* Scheduler toggle */}
          <div className="admin-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0' }}>Automatyczne skanowanie</h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                  Włącz automatyczne sprawdzanie zmian w plikach
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={schedulerConfig.enabled}
                  onChange={() => handleConfigUpdate('scheduler', { enabled: !schedulerConfig.enabled })}
                  style={{ width: '20px', height: '20px' }}
                />
                <span style={{ fontWeight: 500 }}>
                  {schedulerConfig.enabled ? 'Włączony' : 'Wyłączony'}
                </span>
              </label>
            </div>
          </div>

          {/* Work hours */}
          <div className="admin-card">
            <h3 style={{ margin: '0 0 15px 0' }}>Godziny pracy</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
              <label>
                <span style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
                  Od godziny
                </span>
                <select
                  value={schedulerConfig.workHours.start}
                  onChange={(e) =>
                    handleConfigUpdate('scheduler', {
                      workHours: { ...schedulerConfig.workHours, start: parseInt(e.target.value) },
                    })
                  }
                  className="admin-input"
                  style={{ width: '100%' }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i}:00
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
                  Do godziny
                </span>
                <select
                  value={schedulerConfig.workHours.end}
                  onChange={(e) =>
                    handleConfigUpdate('scheduler', {
                      workHours: { ...schedulerConfig.workHours, end: parseInt(e.target.value) },
                    })
                  }
                  className="admin-input"
                  style={{ width: '100%' }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>
                      {i}:00
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
                  Interwał (minuty)
                </span>
                <select
                  value={schedulerConfig.workHours.intervalMinutes}
                  onChange={(e) =>
                    handleConfigUpdate('scheduler', {
                      workHours: { ...schedulerConfig.workHours, intervalMinutes: parseInt(e.target.value) },
                    })
                  }
                  className="admin-input"
                  style={{ width: '100%' }}
                >
                  {[15, 30, 60, 120, 240].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Off hours */}
          <div className="admin-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0' }}>Poza godzinami pracy</h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                  Sprawdzanie w godzinach {schedulerConfig.workHours.end}:00 - {schedulerConfig.workHours.start}:00
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={schedulerConfig.offHours.enabled}
                  onChange={() =>
                    handleConfigUpdate('scheduler', {
                      offHours: { ...schedulerConfig.offHours, enabled: !schedulerConfig.offHours.enabled },
                    })
                  }
                  style={{ width: '18px', height: '18px' }}
                />
                <span>{schedulerConfig.offHours.enabled ? 'Włączone' : 'Wyłączone'}</span>
              </label>
            </div>
            {schedulerConfig.offHours.enabled && (
              <label>
                <span style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
                  Interwał (minuty)
                </span>
                <select
                  value={schedulerConfig.offHours.intervalMinutes || 120}
                  onChange={(e) =>
                    handleConfigUpdate('scheduler', {
                      offHours: { ...schedulerConfig.offHours, intervalMinutes: parseInt(e.target.value) },
                    })
                  }
                  className="admin-input"
                  style={{ width: '200px' }}
                >
                  {[60, 120, 240, 480].map((m) => (
                    <option key={m} value={m}>
                      {m} min ({m / 60}h)
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Thumbnail config */}
          {thumbnailConfig && (
            <div className="admin-card">
              <h3 style={{ margin: '0 0 15px 0' }}>Miniaturki</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <label>
                  <span style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
                    Format
                  </span>
                  <select
                    value={thumbnailConfig.format}
                    onChange={(e) =>
                      handleConfigUpdate('thumbnails', { format: e.target.value as 'webp' | 'avif' | 'jpeg' })
                    }
                    className="admin-input"
                    style={{ width: '100%' }}
                  >
                    <option value="webp">WebP (zalecane)</option>
                    <option value="avif">AVIF (mniejszy, wolniejszy)</option>
                    <option value="jpeg">JPEG (kompatybilny)</option>
                  </select>
                </label>
                <label>
                  <span style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
                    Lokalizacja
                  </span>
                  <select
                    value={thumbnailConfig.storage}
                    onChange={(e) =>
                      handleConfigUpdate('thumbnails', { storage: e.target.value as 'local' | 'remote' })
                    }
                    className="admin-input"
                    style={{ width: '100%' }}
                  >
                    <option value="local">Railway (lokalnie)</option>
                    <option value="remote">Serwer zdalny</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {/* Email Notifications */}
          <div className="admin-card" style={{ marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0' }}>Powiadomienia email</h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                  Otrzymuj powiadomienia po zakończeniu operacji cache
                </p>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={emailConfig?.enabled || false}
                  onChange={() => handleEmailConfigUpdate({ enabled: !emailConfig?.enabled })}
                  style={{ width: '18px', height: '18px' }}
                />
                <span>{emailConfig?.enabled ? 'Włączone' : 'Wyłączone'}</span>
              </label>
            </div>
            {emailConfig?.enabled && (
              <div style={{ display: 'grid', gap: '15px' }}>
                <label>
                  <span style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '5px' }}>
                    Adres email (pozostaw pusty dla domyślnego admina)
                  </span>
                  <input
                    type="email"
                    value={emailConfig?.email || ''}
                    onChange={(e) => handleEmailConfigUpdate({ email: e.target.value })}
                    placeholder="domyślny: admin"
                    className="admin-input"
                    style={{ width: '100%', maxWidth: '300px' }}
                  />
                </label>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={emailConfig?.notifyOnRebuild ?? true}
                      onChange={() => handleEmailConfigUpdate({ notifyOnRebuild: !emailConfig?.notifyOnRebuild })}
                    />
                    <span style={{ fontSize: '13px' }}>Po rebuild</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={emailConfig?.notifyOnError ?? true}
                      onChange={() => handleEmailConfigUpdate({ notifyOnError: !emailConfig?.notifyOnError })}
                    />
                    <span style={{ fontSize: '13px' }}>Przy błędach</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="admin-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Historia operacji</h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                Wpisów: {history.length} | Zmian: {changes.length}
              </span>
              <button
                onClick={() => handleCleanupHistory(24)}
                disabled={cleaningHistory}
                className="admin-btn admin-btn--purple"
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                {cleaningHistory ? 'Czyszczenie...' : 'Wyczyść stare (24h)'}
              </button>
              <button
                onClick={() => {
                  if (confirm('Czy na pewno chcesz usunąć całą historię?')) {
                    handleClearAllHistory();
                  }
                }}
                disabled={cleaningHistory}
                className="admin-btn admin-btn--danger"
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                Wyczyść całą
              </button>
            </div>
          </div>
          {history.length === 0 ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>Brak historii</p>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {history.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    padding: '12px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827' }}>
                      {entry.details}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px' }}>
                      {formatDate(entry.timestamp)}
                      {entry.duration && ` • ${formatDuration(entry.duration)}`}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 500,
                      background:
                        entry.action === 'error'
                          ? '#fee2e2'
                          : entry.action === 'changes_detected'
                            ? '#fef3c7'
                            : entry.action === 'thumbnails_generated'
                              ? '#dbeafe'
                              : '#d1fae5',
                      color:
                        entry.action === 'error'
                          ? '#991b1b'
                          : entry.action === 'changes_detected'
                            ? '#92400e'
                            : entry.action === 'thumbnails_generated'
                              ? '#1e40af'
                              : '#065f46',
                    }}
                  >
                    {entry.action.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Changes Tab */}
      {activeTab === 'changes' && (
        <div className="admin-card">
          <h3 style={{ margin: '0 0 15px 0' }}>Ostatnie zmiany w plikach</h3>
          {changes.length === 0 ? (
            <p style={{ color: '#6b7280', fontStyle: 'italic' }}>Brak wykrytych zmian</p>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {changes.map((change) => (
                <div
                  key={change.id}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#374151',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={change.path}
                    >
                      {change.path}
                    </div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                      {formatDate(change.timestamp)}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      marginLeft: '10px',
                      background:
                        change.type === 'file_added'
                          ? '#d1fae5'
                          : change.type === 'file_deleted'
                            ? '#fee2e2'
                            : '#fef3c7',
                      color:
                        change.type === 'file_added'
                          ? '#065f46'
                          : change.type === 'file_deleted'
                            ? '#991b1b'
                            : '#92400e',
                    }}
                  >
                    {change.type === 'file_added'
                      ? 'Nowy'
                      : change.type === 'file_deleted'
                        ? 'Usunięty'
                        : 'Zmieniony'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

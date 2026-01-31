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
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'config' | 'history' | 'changes'>('status');

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/cache/status');
      const data = await response.json();
      if (data.success) {
        setStatus(data.status);
        setSchedulerConfig(data.config.scheduler);
        setThumbnailConfig(data.config.thumbnails);
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

  const handleTrigger = async (action: 'scan' | 'regenerate' | 'clear') => {
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

  if (loading) {
    return <div className="admin-card">Ładowanie...</div>;
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '5px', borderBottom: '1px solid #e5e7eb', paddingBottom: '10px' }}>
        {(['status', 'config', 'history', 'changes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
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
            {tab === 'config' && 'Konfiguracja'}
            {tab === 'history' && 'Historia'}
            {tab === 'changes' && 'Zmiany plików'}
          </button>
        ))}
      </div>

      {/* Status Tab */}
      {activeTab === 'status' && (
        <>
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
            </div>
          </div>

          {/* Actions */}
          <div className="admin-card">
            <h3 style={{ margin: '0 0 15px 0', fontSize: '14px' }}>Akcje</h3>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="admin-card">
          <h3 style={{ margin: '0 0 15px 0' }}>Historia operacji</h3>
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

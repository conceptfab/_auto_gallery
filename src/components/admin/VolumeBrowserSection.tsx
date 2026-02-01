import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '../../utils/logger';

interface VolumeFolder {
  name: string;
  path: string;
}

interface VolumeFile {
  name: string;
  path: string;
  size: number;
  modified?: string;
}

interface VolumeListResponse {
  path: string;
  folders: VolumeFolder[];
  files: VolumeFile[];
  error?: string;
  message?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const VolumeBrowserSection: React.FC = () => {
  const [currentPath, setCurrentPath] = useState('');
  const [folders, setFolders] = useState<VolumeFolder[]>([]);
  const [files, setFiles] = useState<VolumeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVolume = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const q = path ? `?path=${encodeURIComponent(path)}` : '';
      const response = await fetch(`/api/admin/volume/files${q}`);
      const data: VolumeListResponse = await response.json();
      if (!response.ok) {
        setError(data.message || data.error || 'Błąd ładowania');
        setFolders([]);
        setFiles([]);
      } else {
        setFolders(data.folders || []);
        setFiles(data.files || []);
        setCurrentPath(data.path ?? path);
      }
    } catch (err) {
      setError('Błąd połączenia');
      logger.error('Volume browser fetch error', err);
      setFolders([]);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVolume('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only (root); navigation uses goToPath → fetchVolume
  }, []);

  const breadcrumbs = currentPath
    ? [
        { name: 'Root', path: '' },
        ...currentPath.split('/').map((part, i, arr) => ({
          name: part,
          path: arr.slice(0, i + 1).join('/'),
        })),
      ]
    : [{ name: 'Root', path: '' }];

  const goToPath = (path: string) => {
    setCurrentPath(path);
    fetchVolume(path);
  };

  return (
    <div className="admin-form-box">
      <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
        Zawartość volume montowanego w <code>/data-storage</code> (storage.json,
        cache, thumbnails itd.).
      </p>
      {error && (
        <div
          style={{
            padding: '12px',
            marginBottom: '12px',
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#991b1b',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}
      {!error && (
        <>
          <div
            style={{
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.path || 'root'}>
                {i > 0 && (
                  <span style={{ color: '#9ca3af', margin: '0 4px' }}>/</span>
                )}
                <button
                  type="button"
                  onClick={() => goToPath(crumb.path)}
                  className="admin-btn"
                  style={{
                    padding: '4px 8px',
                    fontSize: '13px',
                    minHeight: 'auto',
                    background:
                      i === breadcrumbs.length - 1 ? '#e5e7eb' : 'transparent',
                    borderColor: '#d1d5db',
                  }}
                >
                  {crumb.name || 'Root'}
                </button>
              </span>
            ))}
          </div>
          {loading ? (
            <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
              Ładowanie…
            </p>
          ) : (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              {folders.map((f) => (
                <div
                  key={f.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: '1px solid #e5e7eb',
                  }}
                  onClick={() => goToPath(f.path)}
                  onKeyDown={(e) => e.key === 'Enter' && goToPath(f.path)}
                  role="button"
                  tabIndex={0}
                >
                  <span style={{ fontSize: '18px' }}>📁</span>
                  <span style={{ fontWeight: 500, fontSize: '14px' }}>
                    {f.name}
                  </span>
                </div>
              ))}
              {files.map((file) => (
                <div
                  key={file.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 12px',
                    backgroundColor: '#fff',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    fontSize: '14px',
                  }}
                >
                  <span style={{ fontSize: '16px' }}>📄</span>
                  <span style={{ flex: 1, wordBreak: 'break-all' }}>
                    {file.name}
                  </span>
                  <span style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {formatBytes(file.size)}
                  </span>
                </div>
              ))}
              {!loading && folders.length === 0 && files.length === 0 && (
                <p style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                  Pusty folder.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

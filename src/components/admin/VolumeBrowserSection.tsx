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
  const [processing, setProcessing] = useState<string | null>(null);

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

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.join('/');
    goToPath(parentPath);
  };

  const handleDelete = async (
    itemPath: string,
    type: 'file' | 'folder',
    name: string
  ) => {
    const msg =
      type === 'folder'
        ? `Usunąć folder „${name}” i całą jego zawartość?`
        : `Usunąć plik „${name}”?`;
    if (!confirm(msg)) return;
    setProcessing(itemPath);
    try {
      const response = await fetch('/api/admin/volume/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: itemPath, type }),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        fetchVolume(currentPath);
      } else {
        setError(data.error || data.message || 'Błąd usuwania');
      }
    } catch (err) {
      logger.error('Volume delete error', err);
      setError('Błąd połączenia');
    } finally {
      setProcessing(null);
    }
  };

  const downloadUrl = (itemPath: string) =>
    `/api/admin/volume/download?path=${encodeURIComponent(itemPath)}`;

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
              marginBottom: '15px',
              padding: '10px',
              background: '#f9fafb',
              borderRadius: '6px',
              border: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'wrap',
            }}
          >
            {breadcrumbs.map((crumb, i, arr) => (
              <React.Fragment key={crumb.path || 'root'}>
                <button
                  type="button"
                  onClick={() => goToPath(crumb.path)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: i === arr.length - 1 ? '#333' : '#2196F3',
                    cursor: 'pointer',
                    fontWeight: i === arr.length - 1 ? 'bold' : 'normal',
                    padding: '2px 5px',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                >
                  {crumb.name || 'Root'}
                </button>
                {i < arr.length - 1 && (
                  <span style={{ color: '#9ca3af' }}>
                    <i className="las la-angle-right" />
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>
          {loading ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#666',
                fontSize: '1.5rem',
                fontWeight: 100,
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
              }}
            >
              Ładowanie...
            </div>
          ) : (
            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: 'white',
              }}
            >
              {/* Go up */}
              {currentPath && (
                <div
                  onClick={navigateUp}
                  onKeyDown={(e) => e.key === 'Enter' && navigateUp()}
                  role="button"
                  tabIndex={0}
                  style={{
                    padding: '10px 15px',
                    borderBottom: '1px solid #eee',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: '#fafafa',
                  }}
                >
                  <i
                    className="las la-level-up-alt"
                    style={{ transform: 'rotate(90deg)', color: '#6b7280' }}
                  />
                  <span style={{ color: '#6b7280' }}>..</span>
                </div>
              )}
              {folders.map((f) => (
                <div
                  key={f.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 15px',
                    backgroundColor: 'white',
                    borderBottom: '1px solid #eee',
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      minWidth: 0,
                    }}
                    onClick={() => goToPath(f.path)}
                    onKeyDown={(e) => e.key === 'Enter' && goToPath(f.path)}
                    role="button"
                    tabIndex={0}
                  >
                    <i
                      className="las la-folder"
                      style={{ color: '#2563eb' }}
                    />
                    <span style={{ fontWeight: 500 }}>
                      {f.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                    <a
                      href={downloadUrl(f.path)}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="admin-btn"
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        minHeight: 'auto',
                        textDecoration: 'none',
                        borderColor: '#d1d5db',
                      }}
                      onClick={(e) => e.stopPropagation()}
                      title="Pobierz jako ZIP"
                    >
                      <i className="las la-file-archive" style={{ marginRight: 4 }} />
                      ZIP
                    </a>
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger"
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        minHeight: 'auto',
                      }}
                      disabled={processing === f.path}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(f.path, 'folder', f.name);
                      }}
                      title="Usuń folder"
                    >
                      <i className="las la-trash-alt" />
                    </button>
                  </div>
                </div>
              ))}
              {files.map((file) => (
                <div
                  key={file.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 15px',
                    backgroundColor: '#fff',
                    borderBottom: '1px solid #eee',
                  }}
                >
                  <i
                    className="las la-file"
                    style={{ color: '#6b7280' }}
                  />
                  <span
                    style={{ flex: 1, wordBreak: 'break-all', minWidth: 0 }}
                  >
                    {file.name}
                  </span>
                  <span style={{ color: '#999', fontSize: '12px' }}>
                    {formatBytes(file.size)}
                  </span>
                  <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                    <a
                      href={downloadUrl(file.path)}
                      download={file.name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="admin-btn"
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        minHeight: 'auto',
                        textDecoration: 'none',
                        borderColor: '#d1d5db',
                      }}
                      title="Pobierz plik"
                    >
                      <i className="las la-download" />
                    </a>
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger"
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        minHeight: 'auto',
                      }}
                      disabled={processing === file.path}
                      onClick={() => handleDelete(file.path, 'file', file.name)}
                      title="Usuń plik"
                    >
                      <i className="las la-trash-alt" />
                    </button>
                  </div>
                </div>
              ))}
              {!loading && folders.length === 0 && files.length === 0 && (
                <div
                  style={{
                    padding: '60px 20px',
                    textAlign: 'center',
                    color: '#999',
                  }}
                >
                  <div style={{ fontSize: '40px', marginBottom: '10px' }}>
                    <i className="las la-folder-open" />
                  </div>
                  <div>Folder jest pusty</div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

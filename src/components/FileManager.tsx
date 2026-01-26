import React, { useState, useEffect, useRef, DragEvent } from 'react';
import { logger } from '../utils/logger';
import FolderConverter from './FolderConverter';
import { useNotification } from './GlobalNotification';

interface FileItem {
  name: string;
  path: string;
  size?: number;
  modified?: string;
}

interface FolderItem {
  name: string;
  path: string;
}

interface FileListResponse {
  folders: FolderItem[];
  files: FileItem[];
  error?: string;
}

const FileManager: React.FC = () => {
  const [currentFolder, setCurrentFolder] = useState('');
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const { showError, showSuccess, showWarning } = useNotification();
  
  // Upload
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Drag & drop upload
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  
  // Nowy folder
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Zmiana nazwy
  const [renamingItem, setRenamingItem] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  
  // Konwersja folderu
  const [convertingFolder, setConvertingFolder] = useState<string | null>(null);
  
  // Zaznaczanie
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
  // Drag & drop przenoszenie
  const [draggingItem, setDraggingItem] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const fetchFiles = async (folder: string = '') => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/files/list?folder=${encodeURIComponent(folder)}`);
      const data: FileListResponse = await response.json();
      
      if (data.error) {
        setError(data.error);
        setFolders([]);
        setFiles([]);
      } else {
        setFolders(data.folders || []);
        setFiles(data.files || []);
      }
    } catch (err) {
      setError('Błąd ładowania plików');
      logger.error('Error loading files', err);
    } finally {
      setLoading(false);
      setSelectedItems(new Set());
    }
  };

  useEffect(() => {
    fetchFiles(currentFolder);
  }, [currentFolder]);

  const navigateToFolder = (folderPath: string) => {
    setCurrentFolder(folderPath);
  };

  const navigateUp = () => {
    const parts = currentFolder.split('/').filter(Boolean);
    parts.pop();
    setCurrentFolder(parts.join('/'));
  };

  const getBreadcrumbs = () => {
    const parts = currentFolder.split('/').filter(Boolean);
    const crumbs = [{ name: 'Root', path: '' }];
    let path = '';
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      crumbs.push({ name: part, path });
    }
    return crumbs;
  };

  // ==================== SELECTION ====================
  
  const toggleSelection = (path: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(path)) {
      newSelection.delete(path);
    } else {
      newSelection.add(path);
    }
    setSelectedItems(newSelection);
  };

  const selectAll = () => {
    const allPaths = [
      ...folders.map(f => f.path),
      ...files.map(f => f.path)
    ];
    setSelectedItems(new Set(allPaths));
  };

  const deselectAll = () => {
    setSelectedItems(new Set());
  };

  // ==================== DRAG & DROP UPLOAD ====================
  
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      await uploadFiles(Array.from(droppedFiles));
    }
  };

  // ==================== UPLOAD ====================
  
  const uploadFiles = async (filesToUpload: File[]) => {
    if (filesToUpload.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`/api/admin/files/upload?folder=${encodeURIComponent(currentFolder)}`, {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        if (!response.ok) {
          alert(`Błąd uploadu ${file.name}: ${result.error}`);
        }
        
        setUploadProgress(Math.round(((i + 1) / filesToUpload.length) * 100));
      } catch (err) {
        logger.error('Upload error', { file: file.name, error: err });
        alert(`Błąd uploadu ${file.name}`);
      }
    }

    setUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fetchFiles(currentFolder);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;
    await uploadFiles(Array.from(selectedFiles));
  };

  // ==================== DELETE ====================
  
  const handleDelete = async (path: string, isFolder: boolean) => {
    const itemType = isFolder ? 'folder' : 'plik';
    if (!confirm(`Czy na pewno chcesz usunąć ten ${itemType}?\n${path}`)) return;

    setProcessing(path);
    try {
      const response = await fetch('/api/admin/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });

      const result = await response.json();
      if (!response.ok) {
        alert(`Błąd: ${result.error}`);
      } else {
        fetchFiles(currentFolder);
      }
    } catch (err) {
      logger.error('Delete error', { path, error: err });
      alert('Błąd usuwania');
    } finally {
      setProcessing(null);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedItems.size === 0) return;
    if (!confirm(`Czy na pewno chcesz usunąć ${selectedItems.size} elementów?`)) return;

    setProcessing('batch-delete');
    for (const path of selectedItems) {
      try {
        await fetch('/api/admin/files/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        });
      } catch (err) {
        logger.error('Delete error (batch)', { path, error: err });
      }
    }
    setProcessing(null);
    fetchFiles(currentFolder);
  };

  // ==================== RENAME ====================
  
  const startRename = (path: string, currentName: string) => {
    setRenamingItem(path);
    setNewName(currentName);
  };

  const handleRename = async (oldPath: string) => {
    if (!newName.trim()) {
      setRenamingItem(null);
      return;
    }

    setProcessing(oldPath);
    try {
      const response = await fetch('/api/admin/files/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newName: newName.trim() }),
      });

      const result = await response.json();
      if (!response.ok) {
        alert(`Błąd: ${result.error}`);
      } else {
        fetchFiles(currentFolder);
      }
    } catch (err) {
      logger.error('Rename error', { oldPath, newName, error: err });
      alert('Błąd zmiany nazwy');
    } finally {
      setProcessing(null);
      setRenamingItem(null);
      setNewName('');
    }
  };

  // ==================== CREATE FOLDER ====================
  
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setShowNewFolder(false);
      return;
    }

    setProcessing('new-folder');
    try {
      const response = await fetch('/api/admin/files/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          parentFolder: currentFolder, 
          folderName: newFolderName.trim() 
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        alert(`Błąd: ${result.error || JSON.stringify(result)}`);
      } else {
        fetchFiles(currentFolder);
      }
    } catch (err) {
      logger.error('Mkdir error', { folder: newFolderName.trim(), error: err });
      alert('Błąd tworzenia folderu');
    } finally {
      setProcessing(null);
      setShowNewFolder(false);
      setNewFolderName('');
    }
  };

  // ==================== MOVE (DRAG & DROP) ====================
  
  const handleItemDragStart = (e: DragEvent<HTMLDivElement>, path: string) => {
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingItem(path);
  };

  const handleItemDragEnd = () => {
    setDraggingItem(null);
    setDropTarget(null);
  };

  const handleFolderDragOver = (e: DragEvent<HTMLDivElement>, folderPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggingItem && draggingItem !== folderPath) {
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(folderPath);
    }
  };

  const handleFolderDragLeave = () => {
    setDropTarget(null);
  };

  const handleFolderDrop = async (e: DragEvent<HTMLDivElement>, targetFolder: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath || sourcePath === targetFolder) return;

    // Przenieś zaznaczone elementy lub pojedynczy element
    const itemsToMove = selectedItems.has(sourcePath) && selectedItems.size > 1
      ? Array.from(selectedItems)
      : [sourcePath];

    setProcessing('moving');
    for (const path of itemsToMove) {
      try {
        const response = await fetch('/api/admin/files/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourcePath: path, targetFolder }),
        });

        const result = await response.json();
        if (!response.ok) {
          alert(`Błąd przenoszenia ${path}: ${result.error}`);
        }
      } catch (err) {
        logger.error('Move error', { path, targetFolder, error: err });
      }
    }
    setProcessing(null);
    setDraggingItem(null);
    fetchFiles(currentFolder);
  };

  // Drop na breadcrumb (przeniesienie do folderu nadrzędnego)
  const handleBreadcrumbDrop = async (e: DragEvent<HTMLButtonElement>, targetFolder: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath) return;

    const itemsToMove = selectedItems.has(sourcePath) && selectedItems.size > 1
      ? Array.from(selectedItems)
      : [sourcePath];

    setProcessing('moving');
    for (const path of itemsToMove) {
      try {
        await fetch('/api/admin/files/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourcePath: path, targetFolder }),
        });
      } catch (err) {
        logger.error('Move error (breadcrumb)', { path, targetFolder, error: err });
      }
    }
    setProcessing(null);
    setDraggingItem(null);
    fetchFiles(currentFolder);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const allItems = [...folders.map(f => f.path), ...files.map(f => f.path)];
  const allSelected = allItems.length > 0 && allItems.every(p => selectedItems.has(p));

  return (
    <section style={{ marginBottom: '40px' }}>
      <h2 style={{ color: '#FF9800', borderBottom: '2px solid #ddd', paddingBottom: '10px' }}>
        📁 Menedżer plików
      </h2>

      {/* Toolbar */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '15px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          accept="image/*,video/*"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: uploading ? 'not-allowed' : 'pointer',
            opacity: uploading ? 0.6 : 1
          }}
        >
          {uploading ? `Uploading... ${uploadProgress}%` : '⬆️ Upload'}
        </button>
        
        <button
          onClick={() => setShowNewFolder(true)}
          disabled={showNewFolder}
          style={{
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          📁 Nowy folder
        </button>
        
        {selectedItems.size > 0 && (
          <button
            onClick={handleDeleteSelected}
            disabled={processing === 'batch-delete'}
            style={{
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            🗑️ Usuń ({selectedItems.size})
          </button>
        )}
        
        <button
          onClick={() => fetchFiles(currentFolder)}
          style={{
            backgroundColor: '#666',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          🔄 Odśwież
        </button>

        <span style={{ color: '#666', fontSize: '12px', marginLeft: 'auto' }}>
          Przeciągnij pliki na stronę aby uploadować
        </span>
      </div>

      {/* Nowy folder input */}
      {showNewFolder && (
        <div style={{ 
          display: 'flex', 
          gap: '10px', 
          marginBottom: '15px',
          alignItems: 'center'
        }}>
          <input
            type="text"
            placeholder="Nazwa folderu"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            autoFocus
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              fontSize: '14px',
              width: '200px'
            }}
          />
          <button
            onClick={handleCreateFolder}
            disabled={processing === 'new-folder'}
            style={{
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '8px 12px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Utwórz
          </button>
          <button
            onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
            style={{
              backgroundColor: '#666',
              color: 'white',
              border: 'none',
              padding: '8px 12px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Anuluj
          </button>
        </div>
      )}

      {/* Breadcrumbs */}
      <div style={{ 
        marginBottom: '15px', 
        padding: '10px',
        background: '#f5f5f5',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        flexWrap: 'wrap'
      }}>
        {getBreadcrumbs().map((crumb, index, arr) => (
          <React.Fragment key={crumb.path}>
            <button
              onClick={() => navigateToFolder(crumb.path)}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDrop={(e) => handleBreadcrumbDrop(e, crumb.path)}
              style={{
                background: 'none',
                border: draggingItem ? '2px dashed #2196F3' : 'none',
                color: index === arr.length - 1 ? '#333' : '#2196F3',
                cursor: 'pointer',
                fontWeight: index === arr.length - 1 ? 'bold' : 'normal',
                padding: '2px 5px',
                borderRadius: '4px'
              }}
            >
              {crumb.name}
            </button>
            {index < arr.length - 1 && <span style={{ color: '#999' }}>/</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Content - with drag & drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: isDraggingOver ? '3px dashed #4CAF50' : '1px solid #ddd',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: isDraggingOver ? 'rgba(76, 175, 80, 0.1)' : 'white',
          minHeight: '200px',
          transition: 'all 0.2s ease'
        }}
      >
        {loading ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666', fontSize: '1.5rem', fontWeight: 100 }}>
            Ładowanie...
          </div>
        ) : error ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#e53e3e', fontSize: '1.5rem', fontWeight: 100 }}>
            {error}
          </div>
        ) : (
          <>
            {/* Header z zaznaczaniem */}
            {(folders.length > 0 || files.length > 0) && (
              <div style={{
                padding: '8px 15px',
                borderBottom: '1px solid #eee',
                background: '#fafafa',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => allSelected ? deselectAll() : selectAll()}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '12px', color: '#666' }}>
                  {selectedItems.size > 0 ? `Zaznaczono: ${selectedItems.size}` : 'Zaznacz wszystko'}
                </span>
              </div>
            )}

            {/* Go up */}
            {currentFolder && (
              <div
                onClick={navigateUp}
                onDragOver={(e) => { e.preventDefault(); setDropTarget('..'); }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  const parts = currentFolder.split('/').filter(Boolean);
                  parts.pop();
                  handleBreadcrumbDrop(e as any, parts.join('/'));
                }}
                style={{
                  padding: '10px 15px',
                  borderBottom: '1px solid #eee',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: dropTarget === '..' ? '#e3f2fd' : '#fafafa'
                }}
              >
                <span style={{ width: '20px' }}></span>
                <span>⬆️</span>
                <span style={{ color: '#666' }}>..</span>
              </div>
            )}

            {/* Folders */}
            {folders.map((folder) => (
              <div
                key={folder.path}
                draggable
                onDragStart={(e) => handleItemDragStart(e, folder.path)}
                onDragEnd={handleItemDragEnd}
                onDragOver={(e) => handleFolderDragOver(e, folder.path)}
                onDragLeave={handleFolderDragLeave}
                onDrop={(e) => handleFolderDrop(e, folder.path)}
                style={{
                  padding: '10px 15px',
                  borderBottom: '1px solid #eee',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: dropTarget === folder.path ? '#e3f2fd' : 
                             draggingItem === folder.path ? '#fff3e0' :
                             selectedItems.has(folder.path) ? '#e8f5e9' : 'white',
                  opacity: processing === folder.path ? 0.5 : 1,
                  cursor: 'grab'
                }}
              >
                {renamingItem === folder.path ? (
                  <div style={{ display: 'flex', gap: '10px', flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={selectedItems.has(folder.path)}
                      onChange={() => toggleSelection(folder.path)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(folder.path);
                        if (e.key === 'Escape') setRenamingItem(null);
                      }}
                      autoFocus
                      style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid #ddd' }}
                    />
                    <button onClick={() => handleRename(folder.path)} style={{ padding: '4px 8px' }}>✓</button>
                    <button onClick={() => setRenamingItem(null)} style={{ padding: '4px 8px' }}>✕</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={selectedItems.has(folder.path)}
                        onChange={() => toggleSelection(folder.path)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div 
                        onClick={() => navigateToFolder(folder.path)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}
                      >
                        <span>📁</span>
                        <span style={{ fontWeight: 500 }}>{folder.name}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        onClick={() => setConvertingFolder(convertingFolder === folder.path ? null : folder.path)}
                        style={{ background: '#FF9800', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Konwertuj →WebP
                      </button>
                      <button
                        onClick={() => startRename(folder.path, folder.name)}
                        style={{ background: '#2196F3', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Zmień nazwę
                      </button>
                      <button
                        onClick={() => handleDelete(folder.path, true)}
                        disabled={processing === folder.path}
                        style={{ background: '#f44336', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Usuń
                      </button>
                    </div>
                  </>
                )}
                
                {/* Konwerter folderu */}
                {convertingFolder === folder.path && (
                  <div style={{ 
                    padding: '15px',
                    background: '#f8f9fa',
                    borderTop: '1px solid #dee2e6',
                    borderBottom: '1px solid #dee2e6'
                  }}>
                    <FolderConverter
                      folderUrl={folder.path}
                      folderName={folder.name}
                      onComplete={() => {
                        setConvertingFolder(null);
                        fetchFiles(currentFolder); // Odśwież listę plików
                      }}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Files */}
            {files.map((file) => (
              <div
                key={file.path}
                draggable
                onDragStart={(e) => handleItemDragStart(e, file.path)}
                onDragEnd={handleItemDragEnd}
                style={{
                  padding: '10px 15px',
                  borderBottom: '1px solid #eee',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: draggingItem === file.path ? '#fff3e0' :
                             selectedItems.has(file.path) ? '#e8f5e9' : 'white',
                  opacity: processing === file.path ? 0.5 : 1,
                  cursor: 'grab'
                }}
              >
                {renamingItem === file.path ? (
                  <div style={{ display: 'flex', gap: '10px', flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={selectedItems.has(file.path)}
                      onChange={() => toggleSelection(file.path)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(file.path);
                        if (e.key === 'Escape') setRenamingItem(null);
                      }}
                      autoFocus
                      style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', border: '1px solid #ddd' }}
                    />
                    <button onClick={() => handleRename(file.path)} style={{ padding: '4px 8px' }}>✓</button>
                    <button onClick={() => setRenamingItem(null)} style={{ padding: '4px 8px' }}>✕</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={selectedItems.has(file.path)}
                        onChange={() => toggleSelection(file.path)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span>🖼️</span>
                      <span>{file.name}</span>
                      <span style={{ color: '#999', fontSize: '12px' }}>{formatFileSize(file.size)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button
                        onClick={() => startRename(file.path, file.name)}
                        style={{ background: '#2196F3', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Zmień nazwę
                      </button>
                      <button
                        onClick={() => handleDelete(file.path, false)}
                        disabled={processing === file.path}
                        style={{ background: '#f44336', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Usuń
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Empty state */}
            {folders.length === 0 && files.length === 0 && (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: '#999' }}>
                <div style={{ fontSize: '48px', marginBottom: '10px' }}>📂</div>
                <div>Folder jest pusty</div>
                <div style={{ fontSize: '12px', marginTop: '5px' }}>
                  Przeciągnij pliki tutaj lub kliknij "Upload"
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default FileManager;

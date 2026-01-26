import React, { useState, useEffect } from 'react';
import { GalleryFolder, ImageFile, GalleryResponse } from '@/src/types/gallery';
import ImageGrid from './ImageGrid';
import ImageMetadata from './ImageMetadata';
import LoadingOverlay from './LoadingOverlay';
import { logger } from '@/src/utils/logger';

interface FolderSectionProps {
  folder: GalleryFolder;
  onImageClick: (image: ImageFile) => void;
}

const FolderSection: React.FC<FolderSectionProps> = ({ folder, onImageClick }) => {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  
  const toggleFolder = (folderPath: string) => {
    const newCollapsed = new Set(collapsedFolders);
    if (newCollapsed.has(folderPath)) {
      newCollapsed.delete(folderPath);
    } else {
      newCollapsed.add(folderPath);
    }
    setCollapsedFolders(newCollapsed);
  };

  const renderFolder = (currentFolder: GalleryFolder, depth: number = 0) => {
    const indentClass = `level-${Math.min(depth, 4)}`;
    const categoryClass = currentFolder.isCategory ? 'category' : 'gallery-folder';
    const isCollapsed = collapsedFolders.has(currentFolder.path);
    const hasCollapsibleContent = currentFolder.subfolders || (!currentFolder.isCategory && currentFolder.images.length > 0);
    
    return (
      <div key={currentFolder.path} className={`folder-wrapper ${categoryClass} ${indentClass} ${!isCollapsed ? 'expanded' : ''}`}>
        {currentFolder.isCategory ? (
          <div className="category-header">
            <h2 className="category-title">
              <div className="folder-title-left">
                <i className="lar la-folder category-icon"></i>
                {currentFolder.name}
                {isCollapsed && currentFolder.subfolders && depth === 0 && (
                  <span className="subfolder-list">
                    / {currentFolder.subfolders.map(sub => sub.name).join(', ')}
                  </span>
                )}
              </div>
              {hasCollapsibleContent && (
                <button 
                  className={`folder-action-button ${isCollapsed ? 'collapsed' : ''}`}
                  onClick={() => toggleFolder(currentFolder.path)}
                >
                  <i className="las la-angle-up"></i>
                </button>
              )}
            </h2>
          </div>
        ) : (
          <div className="gallery-section">
            <h3 className="gallery-title">
              <div className="folder-title-left">
                <i className="lar la-image gallery-icon"></i>
                {currentFolder.name}
                <span className="inline-image-count">
                  ({currentFolder.images.length})
                </span>
              </div>
              {hasCollapsibleContent && (
                <button 
                  className={`folder-action-button ${isCollapsed ? 'collapsed' : ''}`}
                  onClick={() => toggleFolder(currentFolder.path)}
                >
                  <i className="las la-angle-up"></i>
                </button>
              )}
            </h3>
            {!isCollapsed && (
              <ImageGrid 
                images={currentFolder.images} 
                onImageClick={onImageClick}
                folderName={currentFolder.name}
              />
            )}
          </div>
        )}
        
        {currentFolder.subfolders && !isCollapsed && (
          <div className="subfolders">
            {currentFolder.subfolders.map((subfolder) => 
              renderFolder(subfolder, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return renderFolder(folder);
};

interface GalleryProps {
  refreshKey?: number;
  groupId?: string;
}

const Gallery: React.FC<GalleryProps> = ({ refreshKey, groupId }) => {
  const [folders, setFolders] = useState<GalleryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageFile | null>(null);

  logger.debug('Gallery component render', { loading, folderCount: folders.length, error });

  useEffect(() => {
    logger.debug('useEffect triggered with refreshKey', { refreshKey });
    fetchGalleryData();
  }, [refreshKey]);

  const fetchGalleryData = async () => {
    try {
      logger.info('Fetching gallery data');
      setLoading(true);
      setError(null);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        logger.error('Gallery API timeout');
        controller.abort();
      }, 30000); // 30s timeout
      
      // Dodaj groupId do URL jeśli jest podany (podgląd admina)
      const apiUrl = groupId ? `/api/gallery?groupId=${groupId}` : '/api/gallery';
      
      const response = await fetch(apiUrl, {
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      logger.debug('Response status', { status: response.status });
      
      // Obsługa 304 Not Modified
      if (response.status === 304) {
        logger.info('Gallery not modified - using cached data');
        setLoading(false);
        return;
      }
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const data: GalleryResponse = await response.json();
      logger.debug('Response data', { 
        dataLength: JSON.stringify(data).length,
        foldersCount: data.data?.length || 0 
      });
      
      if (data.success && data.data && data.data.length > 0) {
        logger.info('Gallery loaded successfully', { foldersCount: data.data.length });
        setFolders(data.data);
        setError(null);
      } else {
        logger.error('Gallery API error or empty', { error: data.error || 'Empty data' });
        setError(data.error || 'Brak danych w galerii');
      }
    } catch (err: any) {
      logger.error('Fetch error', err);
      if (err.name === 'AbortError') {
        setError('Timeout - API nie odpowiada');
      } else {
        setError(`Błąd połączenia: ${err.message}`);
      }
    } finally {
      logger.debug('Setting loading to false');
      setLoading(false);
    }
  };

  const handleImageClick = (image: ImageFile) => {
    setSelectedImage(image);
  };

  const closeModal = () => {
    setSelectedImage(null);
  };

  const getOptimizedImageUrl = (image: ImageFile, size: 'thumb' | 'full' = 'full') => {
    return `/api/image-proxy?url=${encodeURIComponent(image.url)}&size=${size}`;
  };

  if (loading) {
    return <LoadingOverlay message="Ładowanie galerii..." />;
  }

  if (error) {
    return (
      <div className="error">
        <p>Błąd: {error}</p>
        <button onClick={fetchGalleryData} className="retry-button">
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  return (
    <>
      {folders.length === 0 ? (
        <div className="no-images">
          <p>Nie znaleziono obrazów w galerii</p>
        </div>
      ) : (
        <div className="folders-container">
          {folders.map((folder, index) => (
            <FolderSection 
              key={`${folder.path}-${index}`} 
              folder={folder} 
              onImageClick={handleImageClick}
            />
          ))}
        </div>
      )}

      {selectedImage && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={closeModal}>
              <i className="las la-times"></i>
            </button>
            <button 
              className="modal-download-button"
              onClick={(e) => {
                e.stopPropagation();
                const link = document.createElement('a');
                link.href = selectedImage.url;
                link.download = selectedImage.name;
                link.click();
              }}
              title="Pobierz plik"
            >
              <i className="las la-download"></i>
            </button>
            <img 
              src={getOptimizedImageUrl(selectedImage, 'full')} 
              alt={selectedImage.name}
              className="modal-image"
            />
            <div className="modal-info">
              <h3>{selectedImage.name}</h3>
              <ImageMetadata 
                src={selectedImage.url} 
                fileSize={selectedImage.fileSize} 
                lastModified={selectedImage.lastModified}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Gallery;
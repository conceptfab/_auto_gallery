import React, { useState, useEffect } from 'react';
import { GalleryFolder, ImageFile, GalleryResponse } from '@/src/types/gallery';
import ImageGrid from './ImageGrid';
import CacheProgress from './CacheProgress';
import ImageMetadata from './ImageMetadata';
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
      <div key={currentFolder.path} className={`folder-wrapper ${categoryClass} ${indentClass}`}>
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
}

const Gallery: React.FC<GalleryProps> = ({ refreshKey }) => {
  const [folders, setFolders] = useState<GalleryFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageFile | null>(null);
  const [showCacheProgress, setShowCacheProgress] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);

  logger.debug('Gallery component render', { loading, folderCount: folders.length, error });

  const checkCacheAndFetch = async (forceClearCache = false) => {
    logger.galleryStart('gallery load');
    setCacheReady(false);
    
    try {
      // If force refresh is requested, clear cache first
      if (forceClearCache) {
        logger.cacheStatus('Force refresh - clearing cache');
        setIsForceRefreshing(true);
        setLoading(true);
        setError(null);
        
        try {
          const clearResponse = await fetch('/api/cache-clear', { method: 'POST' });
          const clearData = await clearResponse.json();
          
          if (clearData.success) {
            logger.cacheStatus('Cache cleared successfully');
            setIsForceRefreshing(false);
            // Po wyczyszczeniu cache, pobierz galerię od nowa
            await fetchGalleryData();
            return;
          } else {
            logger.error('Failed to clear cache', clearData.message);
            setIsForceRefreshing(false);
          }
        } catch (clearError) {
          console.error('❌ Error clearing cache:', clearError);
          setIsForceRefreshing(false);
        }
      }

      const cacheStatus = await fetch('/api/cache-status');
      const cacheData = await cacheStatus.json();
      
      if (cacheData.needsRefresh) {
        console.log('🔄 Cache needs refresh - loading gallery without cache...');
        setCacheReady(false);
        await fetchGalleryData();
        return;
      }
      
      console.log('✅ Cache valid, loading gallery with cache...');
      setCacheReady(true);
      await fetchGalleryData();
    } catch (error) {
      console.error('❌ Cache check error:', error);
      console.log('📡 Fallback to direct gallery fetch...');
      await fetchGalleryData();
    }
  };

  useEffect(() => {
    console.log('🔄 useEffect triggered with refreshKey:', refreshKey);
    // If refreshKey > 0, it means user clicked refresh button
    const isForceRefresh = (refreshKey || 0) > 0;
    checkCacheAndFetch(isForceRefresh);
  }, [refreshKey]);

  const handleCacheComplete = () => {
    setCacheReady(true);
    setShowCacheProgress(false);
    fetchGalleryData();
  };

  const fetchGalleryData = async () => {
    try {
      console.log('📡 Fetching gallery data...');
      setLoading(true);
      setError(null);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        console.error('⏰ Gallery API timeout!');
        controller.abort();
      }, 30000); // 30s timeout
      
      const response = await fetch('/api/gallery', {
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      console.log('📡 Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      
      const data: GalleryResponse = await response.json();
      console.log('📡 Response data length:', JSON.stringify(data).length);
      console.log('📡 Folders count:', data.data?.length || 0);
      
      if (data.success && data.data && data.data.length > 0) {
        console.log('✅ Gallery loaded successfully:', data.data.length, 'folders');
        setFolders(data.data);
        setError(null);
      } else {
        console.error('❌ Gallery API error or empty:', data.error || 'Empty data');
        setError(data.error || 'Brak danych w galerii');
      }
    } catch (err: any) {
      console.error('❌ Fetch error:', err);
      if (err.name === 'AbortError') {
        setError('Timeout - API nie odpowiada');
      } else {
        setError(`Błąd połączenia: ${err.message}`);
      }
    } finally {
      console.log('🔄 Setting loading to false');
      setLoading(false);
    }
  };

  const handleImageClick = (image: ImageFile) => {
    setSelectedImage(image);
  };

  const closeModal = () => {
    setSelectedImage(null);
  };

  if (loading) {
    const loadingMessage = isForceRefreshing 
      ? 'Odświeżanie galerii - czyszczenie cache...' 
      : 'Ładowanie galerii...';
    
    return (
      <div className="loading">
        {loadingMessage}
      </div>
    );
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
      {showCacheProgress && (
        <CacheProgress onComplete={handleCacheComplete} />
      )}

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
              src={selectedImage.url} 
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